export function BrushUpChecklist({
    topics,
    done,
    onToggle,
    onPractice,
}: {
    topics: { topic: string; title: string }[];
    done: string[];
    onToggle: (topic: string) => void;
    onPractice: (topic: string) => void;
}) {
    return (
        <section className="brush">
            <h2>Brush-Up Queue</h2>
            {topics.length === 0 ? <p className="studio-quiet">Topics you pass honestly show up here after the report.</p> : (
                <ul>
                    {topics.map((item) => (
                        <li key={item.topic}>
                            <label>
                                <input type="checkbox" checked={done.includes(item.topic)} onChange={() => onToggle(item.topic)} />
                                <span>{item.topic}</span>
                            </label>
                            <small>{item.title}</small>
                            <button type="button" onClick={() => onPractice(item.topic)}>Practice this topic</button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
