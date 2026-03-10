import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Streamdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
