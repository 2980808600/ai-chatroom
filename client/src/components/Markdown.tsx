import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

/**
 * 统一的 Markdown 渲染组件（AI 回复、系统总结共用）。
 * rehype-highlight 负责代码块语法高亮，配合 index.css 里引入的 highlight.js 主题。
 */
export default function Markdown({ content }: { content: string }) {
  return (
    <div className="md-content">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
    </div>
  );
}
