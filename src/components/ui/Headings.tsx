import { type ReactNode } from 'react';
import { useT } from '@/lib/useT';
import type { Bi } from '@/types';

export function PageHead({ title, desc }: { title: Bi; desc: Bi }) {
  const { b } = useT();
  return (
    <div className="page-head">
      <h1>{b(title)}</h1>
      <p>{b(desc)}</p>
    </div>
  );
}

export function SectionHead({
  title,
  sub,
  actions,
}: {
  title: Bi;
  sub?: Bi;
  actions?: ReactNode;
}) {
  const { b } = useT();
  return (
    <div className="section-head">
      <div>
        <h2>{b(title)}</h2>
        {sub && <div className="sub">{b(sub)}</div>}
      </div>
      {actions}
    </div>
  );
}
