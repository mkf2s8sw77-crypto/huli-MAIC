/**
 * Next.js Instrumentation Hook
 *
 * 在服务端启动时执行一次，用于运行应用入口相关配置的环境自检。
 * 参考：https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runAppEntryEnvCheck } = await import('@/lib/server/env-check');
    runAppEntryEnvCheck();
  }
}
