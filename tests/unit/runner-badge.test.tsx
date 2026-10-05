// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RunnerBadge } from '@/components/ui/RunnerBadge';
import { Avatar } from '@/components/ui/Avatar';

afterEach(cleanup);

describe('RunnerBadge', () => {
  it('exposes the type label to assistive tech and shows the short text', () => {
    const { getByRole, getByText } = render(<RunnerBadge type="passion" />);
    expect(getByRole('img', { name: '열정러너' })).toBeTruthy();
    expect(getByText('열정')).toBeTruthy();
  });
  it('injured badge has no text, only the cross', () => {
    const { getByRole, queryByText } = render(<RunnerBadge type="injured" />);
    expect(getByRole('img', { name: '부상러너' })).toBeTruthy();
    expect(queryByText('부상')).toBeNull();
  });
});

describe('Avatar badge', () => {
  it('renders the badge and dims only for injured', () => {
    const a = render(<Avatar src={null} name="짹리" badge="free" />);
    expect(a.getByRole('img', { name: '자유러너' })).toBeTruthy();
    expect(a.getByLabelText('짹리 프로필 · 자유러너').className).not.toContain('grayscale');
    const b = render(<Avatar src={null} name="보안관" badge="injured" />);
    expect(b.getByLabelText('보안관 프로필 · 부상러너').className).toContain('grayscale');
  });
  it('no badge → plain avatar', () => {
    const { queryByRole, getByLabelText } = render(<Avatar src={null} name="홍길동" />);
    expect(queryByRole('img')).toBeNull();
    expect(getByLabelText('홍길동 프로필')).toBeTruthy();
  });
});
