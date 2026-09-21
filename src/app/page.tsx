import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🌸</div>
          <h1 className="text-4xl font-bold text-indigo-600 mb-2">跬步</h1>
          <p className="text-gray-500 mb-2 text-sm tracking-widest">KUǏ BÙ</p>
          <p className="text-gray-700 mt-6 mb-8 leading-relaxed">
            不积跬步，无以至千里
            <br />
            每一步都值得被看见
          </p>

          <div className="flex flex-col gap-3 mt-8">
            <Link
              href="/login"
              className="bg-indigo-600 text-white px-8 py-4 rounded-2xl text-lg font-semibold shadow-lg hover:bg-indigo-700 transition-colors"
            >
              开始使用
            </Link>
            <p className="text-xs text-gray-400 mt-4">
              AI 时代的教育平权工具 · 及时奖励 · AI 辅助辅导
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white px-6 py-12">
        <div className="max-w-md mx-auto space-y-6">
          <Feature icon="⭐" title="及时奖励" desc="德智体美劳五维评价，小红花累计兑换心愿，孩子主动成长" />
          <Feature icon="🤖" title="AI 辅助" desc="英语听写智能判分、作业解析、错题归类，帮家长省时间" />
          <Feature icon="📋" title="任务跟进" desc="从微信群/钉钉群一键导入老师作业，不遗漏" />
        </div>
      </section>

      <footer className="text-center text-gray-400 text-xs py-6">
        © 跬步 KuiBu · 教育平权，从每一小步开始
      </footer>
    </main>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="text-3xl">{icon}</div>
      <div>
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{desc}</p>
      </div>
    </div>
  );
}
