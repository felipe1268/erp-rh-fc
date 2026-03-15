import { toast as sonnerToast } from "sonner";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

function toast(options: ToastOptions) {
  const message = options.title || "";
  const description = options.description;
  if (options.variant === "destructive") {
    sonnerToast.error(message, description ? { description } : undefined);
  } else {
    sonnerToast.success(message, description ? { description } : undefined);
  }
}

export function useToast() {
  return { toast };
}
