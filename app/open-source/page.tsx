import type { Metadata } from 'next';
import Link from 'next/link';
import {
  LICENSE_URL,
  SOURCE_CODE_URL,
  UPSTREAM_SOURCE_URL,
} from '@/lib/constants/open-source';

export const metadata: Metadata = {
  title: '开源说明',
  description: '当前部署实例的开源说明、源码链接与许可证信息。',
};

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-4"
    >
      {children}
    </a>
  );
}

export default function OpenSourceNoticePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-3xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/[0.03] dark:shadow-black/20 p-8 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground/60">
          Open Source Notice
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          本站基于开源项目进行二次开发
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          当前部署实例基于 OpenMAIC 的修改版本运行。原项目采用 GNU Affero General Public
          License v3.0（AGPL-3.0）开源，当前实例对应的源码与许可证入口如下。
        </p>

        <section className="mt-8 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-foreground">当前公开源码仓库</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <ExternalLink href={SOURCE_CODE_URL}>{SOURCE_CODE_URL}</ExternalLink>
            </p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-foreground">上游项目</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <ExternalLink href={UPSTREAM_SOURCE_URL}>{UPSTREAM_SOURCE_URL}</ExternalLink>
            </p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-foreground">许可证</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <ExternalLink href={LICENSE_URL}>查看公开仓库中的 AGPL-3.0 许可证文本</ExternalLink>
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-border/60 bg-background/70 px-5 py-4">
          <h2 className="text-sm font-medium text-foreground">说明</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            本服务包含为部署、集成与业务接入所做的修改。软件按“现状”提供，不附带任何担保。
            如需获取当前运行版本对应源码，请以上述公开源码仓库作为主要入口。
          </p>
        </section>

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-border/60 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
