import { useRef } from "react";
import { Camera, X, Loader2 } from "lucide-react";

export type FotoItem = { url: string; legenda?: string; uploadedAt?: string };

export function compressImage(file: File, max = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > max || height > max) {
          if (width > height) { height = Math.round(height * max / width); width = max; }
          else { width = Math.round(width * max / height); height = max; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function fmtMoney(v: any) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export function fmtDate(s?: string | null) {
  if (!s) return "—";
  const t = String(s).slice(0, 10);
  const [y, m, d] = t.split("-");
  return d && m && y ? `${d}/${m}/${y}` : t;
}

export function FotosUploader({
  fotos, onChange, label = "Fotos", required = false, max = 6,
}: {
  fotos: FotoItem[];
  onChange: (next: FotoItem[]) => void;
  label?: string;
  required?: boolean;
  max?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const news: FotoItem[] = [];
    for (const f of files) {
      try {
        const url = await compressImage(f);
        news.push({ url, uploadedAt: new Date().toISOString() });
      } catch {}
    }
    onChange([...fotos, ...news].slice(0, max));
    e.target.value = "";
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={fotos.length >= max}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" /> Adicionar
        </button>
        <input ref={ref} type="file" accept="image/*" capture="environment" multiple onChange={handle} className="hidden" />
      </div>
      <div className="grid grid-cols-3 gap-2 min-h-[64px] p-2 border border-dashed border-slate-300 rounded">
        {fotos.length === 0 && (
          <div className="col-span-3 text-center text-xs text-slate-400 py-3">
            {required ? "Foto obrigatória — bata uma foto do equipamento" : "Sem fotos"}
          </div>
        )}
        {fotos.map((f, i) => (
          <div key={i} className="relative group">
            <img src={f.url} alt={`foto-${i}`} className="w-full h-20 object-cover rounded border" />
            <button
              type="button"
              onClick={() => onChange(fotos.filter((_, j) => j !== i))}
              className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Spinner() { return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />; }
