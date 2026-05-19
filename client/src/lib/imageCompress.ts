// Rev. 2167 — Compressão client-side de imagens grandes (iPad HDR/12MP)
// para evitar o cap de 10MB no upload de documentos. PDFs passam direto.
// Estratégia: se for imagem > 1.5MB, redimensiona pra no máximo 1920px
// no lado maior e re-encoda como JPEG q=0.82. HEIC do iPad: o browser
// nativo do iPad Safari já decoda HEIC pro <img>, então isso funciona.

export type CompressedFile = {
  base64: string;       // sem prefixo data:
  fileName: string;
  contentType: string;
  originalSize: number;
  finalSize: number;
};

const MAX_IMAGE_BYTES_BEFORE_COMPRESS = 1.5 * 1024 * 1024; // 1.5MB
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Imagem inválida ou formato não suportado pelo navegador."));
    img.src = dataUrl;
  });
}

export async function compressImageIfNeeded(file: File): Promise<CompressedFile> {
  const isImage = file.type.startsWith("image/");
  // Não-imagem (PDF etc.) → passa direto.
  if (!isImage) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      base64: dataUrl.split(",")[1] || "",
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      originalSize: file.size,
      finalSize: file.size,
    };
  }

  // Imagem pequena → passa direto.
  if (file.size <= MAX_IMAGE_BYTES_BEFORE_COMPRESS) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      base64: dataUrl.split(",")[1] || "",
      fileName: file.name,
      contentType: file.type || "image/jpeg",
      originalSize: file.size,
      finalSize: file.size,
    };
  }

  // Imagem grande → carrega, redimensiona em canvas, re-encoda JPEG.
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const { width: w0, height: h0 } = img;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  ctx.drawImage(img, 0, 0, w, h);

  const compressedDataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = compressedDataUrl.split(",")[1] || "";
  const finalSize = Math.ceil((base64.length * 3) / 4);

  // Troca extensão pra .jpg pra refletir o re-encode.
  const baseName = file.name.replace(/\.(heic|heif|png|webp|gif|tiff?|bmp)$/i, "") || file.name;
  const newName = /\.jpe?g$/i.test(baseName) ? baseName : `${baseName}.jpg`;

  return {
    base64,
    fileName: newName,
    contentType: "image/jpeg",
    originalSize: file.size,
    finalSize,
  };
}
