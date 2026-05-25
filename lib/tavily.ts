export async function searchTavily(query: string): Promise<string> {
  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return '';

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return '';
    const data = await res.json();

    const parts: string[] = [];
    if (data.answer) parts.push(`Summary: ${data.answer}`);
    if (data.results?.length > 0) {
      const results = data.results
        .slice(0, 3)
        .map((r: any) => `[${r.title}]\n${r.url}\n${r.content?.slice(0, 300)}`)
        .join('\n\n');
      if (results) parts.push(results);
    }
    return parts.join('\n') || '';
  } catch {
    return '';
  }
}
