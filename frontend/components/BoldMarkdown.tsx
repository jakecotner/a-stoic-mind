// LLM output (breakdowns, reflections) arrives as light markdown — bold
// **headings**, paragraph breaks. Render it as paragraphs with bold spans;
// no markdown library for two markers.
export default function BoldMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed opacity-90">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j}>{part.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{part}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
