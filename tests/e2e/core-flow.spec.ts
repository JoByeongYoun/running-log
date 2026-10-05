import { test, expect, type BrowserContext } from '@playwright/test';
import { createConfirmedUser, login, onboard, PHOTO, admin } from './helpers';

test.beforeAll(async () => {
  await admin().rpc('set_fake_now', { p: null });
});

test('signup → group → invite → record → approve → dashboard', async ({ browser }) => {
  const ownerUser = await createConfirmedUser('owner');
  const memberUser = await createConfirmedUser('member');

  const ownerCtx: BrowserContext = await browser.newContext({ ...test.info().project.use });
  const owner = await ownerCtx.newPage();
  await login(owner, ownerUser.email);
  await onboard(owner, '관리자');
  await expect(owner.getByRole('heading', { name: 'Running Log' })).toBeVisible();

  // create group
  await owner.getByRole('button', { name: '그룹 만들기' }).click();
  await owner.getByLabel('그룹명').fill('E2E 러너');
  await owner.getByLabel('열정러너 주간 목표 (km)').fill('10');
  await owner.getByRole('button', { name: '그룹 만들기' }).click();
  await owner.waitForURL(/\/admin\?tab=members/);
  const code = (await owner.locator('p.font-mono').textContent())!.trim();
  expect(code).toHaveLength(14);

  // member joins via invite link
  const memberCtx = await browser.newContext({ ...test.info().project.use });
  const member = await memberCtx.newPage();
  await member.goto(`/join/${code}`);
  await expect(member.getByRole('heading', { name: 'E2E 러너' })).toBeVisible();
  await member.getByRole('link', { name: '로그인' }).click();
  await member.getByLabel('이메일').fill(memberUser.email);
  await member.getByLabel('비밀번호').fill('password-1234');
  await member.getByRole('button', { name: '로그인' }).click();
  await onboard(member, '멤버');
  await member.waitForURL(/\/join\//);
  await member.getByRole('button', { name: '참여 요청하기' }).click();
  await member.waitForURL('/');
  await expect(member.getByText('관리자 승인을 기다리고 있습니다.')).toBeVisible();

  // owner approves
  await owner.goto('/admin?tab=requests');
  await expect(owner.getByRole('main').getByText('멤버', { exact: true })).toBeVisible();
  await owner.getByRole('button', { name: '승인' }).click();
  await expect(owner.getByText('대기 중인 참여 요청이 없습니다')).toBeVisible();

  // owner changes the member's runner type to 자유러너; badge shows on the dashboard
  await owner.goto('/admin?tab=members');
  const memberGroup = owner.getByRole('radiogroup', { name: '멤버 러너 유형' });
  await expect(memberGroup.getByRole('radio', { name: '열정러너' })).toHaveAttribute('aria-checked', 'true');
  await memberGroup.getByRole('radio', { name: '자유러너' }).click();
  await owner.getByRole('button', { name: '변경' }).click();
  await expect(owner.getByText('자유러너로 바꿨습니다.')).toBeVisible();
  await expect(memberGroup.getByRole('radio', { name: '자유러너' })).toHaveAttribute('aria-checked', 'true');

  await member.goto('/');
  await expect(member.getByRole('img', { name: '자유러너' }).first()).toBeVisible();
  await member.goto('/profile');
  await expect(member.getByText('자유러너', { exact: true })).toBeVisible();
  await member.goto('/notifications');
  await expect(member.getByText('방장이 회원님을 자유러너로 변경했습니다.')).toBeVisible();

  // member submits a record
  await member.goto('/record');
  await expect(member.getByRole('heading', { name: 'E2E 러너' })).toBeVisible();
  await member.getByLabel('거리 (km)').fill('5.25');
  await member.getByLabel('사진 선택').setInputFiles(PHOTO);
  await expect(member.getByText('완료')).toBeVisible();
  await member.getByRole('button', { name: '오늘 기록 제출' }).click();
  await expect(member.getByText('기록을 등록했습니다. 관리자 승인을 기다려 주세요.')).toBeVisible();
  await member.waitForURL('/');
  // 트랙 위에 승인 대기 조각이 기록 상세 링크로 올라간다
  await expect(member.getByRole('link', { name: /5\.25 km · 승인 대기/ })).toBeVisible();

  // owner reviews
  await owner.goto('/admin?tab=reviews');
  await expect(owner.getByText('멤버 · 5.25 km')).toBeVisible();
  await owner.getByRole('button', { name: '승인' }).click();
  await expect(owner.getByText('검토할 기록이 없습니다')).toBeVisible();

  // dashboard reflects approval
  await member.goto('/');
  await expect(member.getByRole('link', { name: /5\.25 km · 승인됨/ })).toBeVisible();
  // 러너를 누르면 멤버 모달: 자유러너 최소 5km 기준 진행률 100%, 가입 주라 준비 주간
  await member.getByRole('button', { name: /^멤버 이번 주 기록 보기/ }).click();
  await expect(member.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(member.getByText('준비 주간', { exact: true })).toBeVisible();
  await expect(member.getByText('자유러너', { exact: true })).toBeVisible();
  await member.getByRole('button', { name: '닫기' }).click();

  // record detail with comment
  await member.locator('a[href^="/records/"]').first().click();
  await member.waitForURL(/\/records\//);
  await expect(member.getByText('승인됨')).toBeVisible();
  await member.getByLabel('댓글 작성').fill('굿잡!');
  await member.getByRole('button', { name: '등록' }).click();
  await expect(member.getByText('굿잡!')).toBeVisible();

  // notifications
  await member.goto('/notifications');
  await expect(member.getByText('E2E 러너 참여가 승인되었습니다.')).toBeVisible();
  await expect(member.getByText('5.25km 기록이 승인되었습니다.')).toBeVisible();

  await ownerCtx.close(); await memberCtx.close();
});

test('manifest and service worker are served; offline page renders', async ({ page }) => {
  const m = await page.request.get('/manifest.webmanifest');
  expect(m.ok()).toBeTruthy();
  expect((await m.json()).name).toBe('Running Log');
  const sw = await page.request.get('/sw.js');
  expect(sw.ok()).toBeTruthy();
  expect(sw.headers()['content-type']).toContain('javascript');
  await page.goto('/offline');
  await expect(page.getByRole('heading', { name: '인터넷에 연결되어 있지 않습니다' })).toBeVisible();
});
