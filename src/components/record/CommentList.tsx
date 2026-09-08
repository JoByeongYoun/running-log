'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addComment, deleteComment } from '@/actions/comment';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

export type CommentItem = { id: string; userId: string; body: string; createdAt: string; nickname: string; avatarUrl: string | null };

export function CommentList({ recordId, myId, isAdmin, comments }: { recordId: string; myId: string; isAdmin: boolean; comments: CommentItem[] }) {
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <h2 className="mb-2 text-sm font-semibold">댓글 {comments.length}</h2>
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2">
            <Avatar src={c.avatarUrl} name={c.nickname} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{c.nickname}</span>
                <span className="text-[11px] text-slate-400">{new Date(c.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                {(c.userId === myId || isAdmin) && (
                  <button type="button" className="ml-auto text-xs text-slate-400 underline" disabled={pending} onClick={() => start(async () => {
                    const res = await deleteComment(c.id, recordId);
                    if (res.error) toast(res.error, 'error'); else router.refresh();
                  })}>삭제</button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{c.body}</p>
            </div>
          </li>
        ))}
        {comments.length === 0 && <li className="text-sm text-slate-500">첫 댓글을 남겨보세요.</li>}
      </ul>
      <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); start(async () => {
        const res = await addComment(recordId, body);
        if (res.error) { toast(res.error, 'error'); return; }
        setBody(''); router.refresh();
      }); }}>
        <Textarea label="댓글 작성" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={2} required />
        <Button type="submit" variant="secondary" loading={pending} disabled={!body.trim()}>등록</Button>
      </form>
    </section>
  );
}
