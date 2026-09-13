export function JsonBlock({ label, text }: { label: string; text: string }) {
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* 原样展示 */ }
  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-[12px] text-accent">
        {label}（{text.length} 字符，点击展开）
      </summary>
      <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted-bg p-3 text-[12px] leading-relaxed">
        {pretty}
      </pre>
    </details>
  );
}
