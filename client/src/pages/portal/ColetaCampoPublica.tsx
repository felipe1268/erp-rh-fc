// Rev. 2858 — COLETA DE CAMPO (RH) — página PÚBLICA (link externo, sem login)
// Auxiliar de campo abre o link/QR da obra, escolhe o funcionário e preenche os
// dados pelo celular. Tudo entra na fila de revisão do RH (não grava direto).
// LGPD: a página NÃO mostra dados pessoais já cadastrados — só nome/função/foto
// para identificar a pessoa. A coleta é feita "do zero".
import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";

const FC_NAVY = "#1B2A4A";

const TAMANHOS_CALCADO = ["33","34","35","36","37","38","39","40","41","42","43","44","45","46","47","48"];
const TAMANHOS_CAMISA = ["PP","P","M","G","GG","XG","XGG","EXG"];
const TAMANHOS_CALCA = ["36","38","40","42","44","46","48","50","52","54","56","58"];

const EPI_CARDS = [
  { key: "tamanhoCalcado", label: "Calçado", emoji: "👟", opts: TAMANHOS_CALCADO, accent: "#0284c7", soft: "#e0f2fe" },
  { key: "tamanhoCamisa",  label: "Camisa",  emoji: "👕", opts: TAMANHOS_CAMISA,  accent: "#059669", soft: "#d1fae5" },
  { key: "tamanhoCalca",   label: "Calça",   emoji: "👖", opts: TAMANHOS_CALCA,   accent: "#d97706", soft: "#fef3c7" },
] as const;

type Dados = Record<string, string>;

export default function ColetaCampoPublica() {
  const [, params] = useRoute("/portal/coleta-rh/:token");
  const token = params?.token || "";

  const sessaoQ = trpc.coletaRh.dadosSessao.useQuery({ token }, { enabled: !!token, retry: false });

  const [busca, setBusca] = useState("");
  const [selFunc, setSelFunc] = useState<any | null>(null);
  const [enviadoPor, setEnviadoPor] = useState("");
  const [dados, setDados] = useState<Dados>({});
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState(false);

  const enviarM = trpc.coletaRh.enviarResposta.useMutation({
    onSuccess: () => {
      setOkMsg(true);
      setTimeout(() => {
        setOkMsg(false);
        setSelFunc(null);
        setDados({});
        setFotoBase64(null);
        setFotoPreview(null);
        sessaoQ.refetch();
      }, 1400);
    },
  });

  const set = (k: string, v: string) => setDados((p) => ({ ...p, [k]: v }));
  const toggleTam = (k: string, v: string) => setDados((p) => ({ ...p, [k]: p[k] === v ? "" : v }));

  const onFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      setFotoPreview(res);
      setFotoBase64(res);
    };
    reader.readAsDataURL(file);
  };

  const funcionariosFiltrados = useMemo(() => {
    const list = (sessaoQ.data && "funcionarios" in sessaoQ.data ? sessaoQ.data.funcionarios : []) || [];
    const q = busca.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f: any) => (f.nome || "").toLowerCase().includes(q));
  }, [sessaoQ.data, busca]);

  const podeEnviar = Object.values(dados).some((v) => v && v.trim() !== "") || !!fotoBase64;

  // ── Estados de carregamento / inválido ────────────────────────────────────
  if (!token) return <Aviso titulo="Link inválido" texto="O link de coleta está incompleto." />;
  if (sessaoQ.isLoading) return <Aviso titulo="Carregando…" texto="Buscando informações da obra." />;
  if (!sessaoQ.data || sessaoQ.data.valido === false) {
    return <Aviso titulo="Link indisponível" texto="Este link de coleta está inativo, expirado ou não existe. Peça um novo ao RH." />;
  }

  const obra = sessaoQ.data.obra;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header FC */}
      <header className="px-4 py-5 text-white" style={{ background: `linear-gradient(120deg, ${FC_NAVY}, #2c4470)` }}>
        <div className="max-w-md mx-auto">
          <p className="text-[11px] uppercase tracking-[2px] text-white/70">FC Engenharia · Coleta de Campo</p>
          <h1 className="text-lg font-bold leading-tight mt-0.5">{sessaoQ.data.titulo || "Coleta de dados"}</h1>
          {obra && <p className="text-sm text-white/80">{obra.nome}{obra.cidade ? ` — ${obra.cidade}` : ""}</p>}
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 pb-24">
        {!selFunc ? (
          <>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar funcionário…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm mb-3 bg-white"
            />
            <div className="space-y-2">
              {funcionariosFiltrados.length === 0 && (
                <p className="text-center text-sm text-slate-500 py-8">Nenhum funcionário alocado nesta obra.</p>
              )}
              {funcionariosFiltrados.map((f: any) => (
                <button
                  key={f.id}
                  onClick={() => { setSelFunc(f); setDados({}); setFotoBase64(null); setFotoPreview(null); }}
                  className="w-full flex items-center gap-3 rounded-xl bg-white border border-slate-200 p-3 text-left active:scale-[0.99] transition"
                >
                  <div className="h-11 w-11 rounded-full bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center text-slate-400">
                    {f.foto ? <img src={f.foto} alt="" className="h-full w-full object-cover" /> : <span className="text-lg">👤</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">{f.nome}</div>
                    <div className="text-xs text-slate-500 truncate">{f.funcao || "—"}</div>
                  </div>
                  {f.jaEnviado && (
                    <span className={`text-[10px] px-2 py-1 rounded-full ${f.jaEnviado === "aprovada" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {f.jaEnviado === "aprovada" ? "✓ enviado" : "⏳ pendente"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        ) : (
          <FormColeta
            func={selFunc}
            dados={dados}
            set={set}
            toggleTam={toggleTam}
            fotoPreview={fotoPreview}
            onFoto={onFoto}
            removerFoto={() => { setFotoBase64(null); setFotoPreview(null); }}
            enviadoPor={enviadoPor}
            setEnviadoPor={setEnviadoPor}
            voltar={() => setSelFunc(null)}
          />
        )}
      </main>

      {/* Barra de envio fixa */}
      {selFunc && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t p-3">
          <div className="max-w-md mx-auto flex gap-2">
            <button
              onClick={() => setSelFunc(null)}
              className="px-4 py-3 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium"
            >
              Voltar
            </button>
            <button
              disabled={!podeEnviar || enviarM.isPending}
              onClick={() => enviarM.mutate({
                token,
                employeeId: selFunc.id,
                enviadoPor: enviadoPor || undefined,
                dados,
                fotoBase64: fotoBase64 || undefined,
                fotoContentType: "image/jpeg",
              })}
              className="flex-1 py-3 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
              style={{ background: FC_NAVY }}
            >
              {enviarM.isPending ? "Enviando…" : "Enviar para o RH"}
            </button>
          </div>
          {enviarM.isError && <p className="max-w-md mx-auto text-xs text-red-600 mt-2">{enviarM.error.message}</p>}
        </div>
      )}

      {/* Overlay sucesso */}
      {okMsg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl px-8 py-6 text-center shadow-xl">
            <div className="text-4xl mb-2">✅</div>
            <p className="font-semibold text-slate-800">Enviado!</p>
            <p className="text-sm text-slate-500">O RH vai revisar os dados.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FormColeta({ func, dados, set, toggleTam, fotoPreview, onFoto, removerFoto, enviadoPor, setEnviadoPor, voltar }: any) {
  return (
    <div className="space-y-4">
      {/* Funcionário selecionado */}
      <div className="flex items-center gap-3 rounded-xl bg-white border border-slate-200 p-3">
        <div className="h-12 w-12 rounded-full bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center text-slate-400">
          {func.foto ? <img src={func.foto} alt="" className="h-full w-full object-cover" /> : <span className="text-xl">👤</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 truncate">{func.nome}</div>
          <div className="text-xs text-slate-500 truncate">{func.funcao || "—"}</div>
        </div>
        <button onClick={voltar} className="text-xs text-slate-500 underline">trocar</button>
      </div>

      {/* Foto */}
      <Secao titulo="Foto">
        <div className="flex items-center gap-3">
          <div className="h-20 w-20 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-400">
            {fotoPreview ? <img src={fotoPreview} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl">📷</span>}
          </div>
          <div className="flex flex-col gap-2">
            <label className="px-3 py-2 rounded-lg text-white text-sm font-medium cursor-pointer text-center" style={{ background: FC_NAVY }}>
              {fotoPreview ? "Trocar foto" : "Tirar / escolher foto"}
              <input type="file" accept="image/*" capture="environment" onChange={onFoto} className="hidden" />
            </label>
            {fotoPreview && <button onClick={removerFoto} className="text-xs text-red-600 underline">remover</button>}
          </div>
        </div>
      </Secao>

      {/* EPI / Uniforme */}
      <Secao titulo="EPI / Uniforme">
        <div className="space-y-3">
          {EPI_CARDS.map((card) => (
            <div key={card.key} className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 text-sm font-medium flex items-center gap-2" style={{ background: card.soft }}>
                <span>{card.emoji}</span><span style={{ color: card.accent }}>{card.label}</span>
              </div>
              <div className="p-2 flex flex-wrap gap-1.5">
                {card.opts.map((o) => {
                  const on = dados[card.key] === o;
                  return (
                    <button
                      key={o}
                      onClick={() => toggleTam(card.key, o)}
                      className="px-2.5 py-1.5 rounded-md text-sm font-medium border transition"
                      style={on
                        ? { background: card.accent, borderColor: card.accent, color: "#fff" }
                        : { background: "#fff", borderColor: "#e2e8f0", color: "#334155" }}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Secao>

      {/* Contato */}
      <Secao titulo="Contato">
        <Campo label="Telefone" value={dados.telefone || ""} onChange={(v) => set("telefone", v)} type="tel" />
        <Campo label="Celular / WhatsApp" value={dados.celular || ""} onChange={(v) => set("celular", v)} type="tel" />
      </Secao>

      {/* Emergência */}
      <Secao titulo="Contato de emergência">
        <Campo label="Nome do contato" value={dados.contatoEmergencia || ""} onChange={(v) => set("contatoEmergencia", v)} />
        <Campo label="Telefone" value={dados.telefoneEmergencia || ""} onChange={(v) => set("telefoneEmergencia", v)} type="tel" />
        <Campo label="Parentesco" value={dados.parentescoEmergencia || ""} onChange={(v) => set("parentescoEmergencia", v)} />
      </Secao>

      {/* Endereço */}
      <Secao titulo="Endereço">
        <Campo label="Logradouro" value={dados.logradouro || ""} onChange={(v) => set("logradouro", v)} />
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Número" value={dados.numero || ""} onChange={(v) => set("numero", v)} />
          <Campo label="Complemento" value={dados.complemento || ""} onChange={(v) => set("complemento", v)} />
        </div>
        <Campo label="Bairro" value={dados.bairro || ""} onChange={(v) => set("bairro", v)} />
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Cidade" value={dados.cidade || ""} onChange={(v) => set("cidade", v)} />
          <Campo label="UF" value={dados.estado || ""} onChange={(v) => set("estado", v.toUpperCase().slice(0, 2))} />
        </div>
        <Campo label="CEP" value={dados.cep || ""} onChange={(v) => set("cep", v)} />
      </Secao>

      {/* Quem coletou */}
      <Secao titulo="Quem está preenchendo">
        <Campo label="Seu nome (auxiliar de campo)" value={enviadoPor} onChange={setEnviadoPor} />
      </Secao>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{titulo}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Campo({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white mt-0.5"
      />
    </label>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 p-6 text-center">
        <div className="text-3xl mb-2">📋</div>
        <h1 className="font-bold text-slate-800">{titulo}</h1>
        <p className="text-sm text-slate-500 mt-1">{texto}</p>
      </div>
    </div>
  );
}
