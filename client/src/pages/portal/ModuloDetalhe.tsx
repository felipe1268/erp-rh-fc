import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, Sparkles, Plug, Building2, Menu, X,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { MODULES, formatPrice } from "./modulesData";
import { MODULE_DETAILS } from "./moduleDetails";
import { ModulePreviewMock } from "./ModulePreviewMock";
import { MODULE_SCREENSHOTS } from "./moduleScreenshots";
import { Monitor } from "lucide-react";

/**
 * Rev. 4053 — Página dedicada de detalhe do módulo (`/planos/modulos/:id`),
 * substitui o antigo dialog pequeno `ModuleDetailDialog` (Rev. 4050). Objetivo:
 * mostrar TODAS as funcionalidades reais do módulo em profundidade, pra vender
 * o produto de verdade — conteúdo em `moduleDetails.ts`, dados base em
 * `modulesData.ts` (nenhum dos dois foi inventado, vem de `shared/modules.ts`).
 */
export default function ModuloDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: catalog } = trpc.billing.getCatalog.useQuery();

  const mod = MODULES.find(m => m.id === id);
  const details = id ? MODULE_DETAILS[id] : undefined;
  const screenshots = id ? MODULE_SCREENSHOTS[id] ?? [] : [];
  const carouselRef = useRef<HTMLDivElement>(null);

  const scrollCarousel = (dir: 1 | -1) => {
    const el = carouselRef.current;
    if (!el) return;
    const slide = el.querySelector<HTMLElement>("[data-slide]");
    const step = slide ? slide.offsetWidth + 20 : el.clientWidth * 0.85;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const price = (() => {
    const found = catalog?.modules.find(m => m.id === id);
    return found ? formatPrice(found.monthlyPriceCents) : null;
  })();

  const goToPlans = () => navigate("/contratar");

  if (!mod || !details) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-slate-500">Módulo não encontrado.</p>
        <Button onClick={() => navigate("/planos")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar pros planos
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-blue-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/planos")} className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-800" />
            <span className="font-bold text-slate-900">ERP Gestão Integrada</span>
          </button>
          <div className="hidden sm:flex items-center gap-3">
            <Button variant="ghost" className="text-slate-600 hover:text-blue-900 hover:bg-blue-50" onClick={() => navigate("/planos")}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Ver todos os módulos
            </Button>
            <Button className="bg-gradient-to-r from-blue-800 to-indigo-800 hover:from-blue-900 hover:to-indigo-900 text-white shadow-lg shadow-blue-200" onClick={goToPlans}>
              Começar grátis
            </Button>
          </div>
          <button className="sm:hidden p-2" onClick={() => setMenuOpen(v => !v)} aria-label="Menu">
            {menuOpen ? <X className="w-6 h-6 text-slate-700" /> : <Menu className="w-6 h-6 text-slate-700" />}
          </button>
        </div>
        {menuOpen && (
          <div className="sm:hidden border-t border-blue-100 px-4 py-3 flex flex-col gap-2 bg-white">
            <Button variant="outline" className="border-blue-200 text-slate-700 hover:bg-blue-50" onClick={() => navigate("/planos")}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Ver todos os módulos
            </Button>
            <Button className="bg-gradient-to-r from-blue-800 to-indigo-800" onClick={goToPlans}>Começar grátis</Button>
          </div>
        )}
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 to-white py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <button onClick={() => navigate("/planos")} className="inline-flex items-center gap-1 text-xs font-medium text-blue-800/70 hover:text-blue-900 mb-5">
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar pros módulos
              </button>
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${mod.color} flex items-center justify-center mb-5 shadow-lg`}>
                <mod.icon className="w-7 h-7 text-white" />
              </div>
              <span className="text-xs font-semibold text-blue-900 tracking-widest uppercase">{mod.subtitle}</span>
              <h1 className="text-3xl sm:text-4xl font-bold mt-2 text-slate-900">{mod.title}</h1>
              <p className="text-lg text-slate-600 mt-4 leading-relaxed">{details.tagline}</p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <span className="text-2xl font-bold text-blue-900">
                  {price ? `${price}/mês` : "Sob consulta"}
                </span>
                <Button size="lg" className="h-12 px-7 bg-gradient-to-r from-blue-800 to-indigo-800 hover:from-blue-900 hover:to-indigo-900 shadow-lg shadow-blue-200" onClick={goToPlans}>
                  Contratar esse módulo <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
            {mod && <ModulePreviewMock m={mod} />}
          </motion.div>
        </div>
      </section>

      {screenshots.length > 0 && (
        <section className="py-14 px-4 sm:px-6 bg-slate-50 border-y border-blue-100">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between gap-2 mb-6">
              <div className="flex items-center gap-2">
                <Monitor className="w-4.5 h-4.5 text-blue-800" />
                <h2 className="text-lg font-bold text-slate-900">Telas reais de {mod.title}</h2>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded-full px-3 py-1 ml-2">
                  Tela real do sistema
                </span>
              </div>
              {screenshots.length > 1 && (
                <div className="hidden sm:flex items-center gap-2">
                  <button
                    onClick={() => scrollCarousel(-1)}
                    aria-label="Tela anterior"
                    className="w-9 h-9 rounded-full border border-blue-200 bg-white flex items-center justify-center text-blue-800 hover:bg-blue-50 transition-colors"
                  >
                    <ChevronLeft className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => scrollCarousel(1)}
                    aria-label="Próxima tela"
                    className="w-9 h-9 rounded-full border border-blue-200 bg-white flex items-center justify-center text-blue-800 hover:bg-blue-50 transition-colors"
                  >
                    <ChevronRight className="w-4.5 h-4.5" />
                  </button>
                </div>
              )}
            </div>
            <div
              ref={carouselRef}
              className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:thin]"
            >
              {screenshots.map((src, i) => (
                <a
                  key={i}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  data-slide
                  className="shrink-0 snap-start w-[85%] sm:w-[68%] lg:w-[58%] block rounded-xl overflow-hidden border border-slate-200 shadow-md hover:shadow-xl transition-shadow bg-slate-900"
                >
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <img src={src} alt={`Tela real ${i + 1} do módulo ${mod.title}`} className="w-full h-auto block" />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl">
            {details.longDescription.map((p, i) => (
              <p key={i} className="text-slate-600 leading-relaxed mb-4">{p}</p>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-10">
            {details.sections.map((section, i) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 4) * 0.05 }}
                className="rounded-2xl border border-blue-100 bg-white p-6"
              >
                <h3 className="font-semibold text-slate-900 mb-4">{section.title}</h3>
                <ul className="space-y-2.5">
                  {section.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-6">
              <h3 className="font-semibold text-violet-900 mb-4 flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5" /> Inteligência artificial aplicada
              </h3>
              <ul className="space-y-2.5">
                {details.aiHighlights.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-violet-800">
                    <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-6">
              <h3 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
                <Plug className="w-4.5 h-4.5" /> Integrado com
              </h3>
              <div className="flex flex-wrap gap-2">
                {details.integrations.map((item, i) => (
                  <span key={i} className="text-xs font-medium text-blue-800 bg-white border border-blue-200 rounded-full px-3 py-1.5">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 bg-gradient-to-b from-white to-blue-50/40">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Outros módulos</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MODULES.filter(m => m.id !== mod.id).slice(0, 4).map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/planos/modulos/${m.id}`)}
                className="group text-left rounded-xl border border-blue-100 bg-white p-4 hover:shadow-lg hover:border-blue-600 transition-all"
              >
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${m.color} flex items-center justify-center mb-3`}>
                  <m.icon className="w-4.5 h-4.5 text-white" />
                </div>
                <h3 className="font-semibold text-sm text-slate-900">{m.title}</h3>
                <span className="flex items-center gap-1 text-xs font-medium text-slate-300 group-hover:text-blue-800 transition-colors mt-2">
                  Ver detalhes <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center rounded-3xl bg-gradient-to-r from-blue-800 to-indigo-800 px-8 py-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Pronto pra ativar {mod.title}?</h2>
          <p className="text-blue-100 mt-3">Comece com esse módulo hoje e adicione outros quando precisar.</p>
          <Button size="lg" className="mt-7 h-12 px-8 bg-white text-blue-900 hover:bg-blue-50 shadow-xl" onClick={goToPlans}>
            Contratar agora <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>
    </div>
  );
}
