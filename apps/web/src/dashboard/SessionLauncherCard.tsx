import { useEffect, useState } from "react";

const PILLS = [
    { id: "behavioral", label: "Behavioral" },
    { id: "technical", label: "Technical" },
    { id: "coding", label: "Coding" },
    { id: "system_design", label: "System design" },
    { id: "hr", label: "HR" },
    { id: "mixed", label: "Mixed" },
];

export function SessionLauncherCard(props: {
    interviewType: string;
    onType: (value: string) => void;
    company: string;
    onCompany: (value: string) => void;
    role: string;
    onRole: (value: string) => void;
    mode: "job" | "skill";
    onMode: (value: "job" | "skill") => void;
    skills: string;
    onSkills: (value: string) => void;
    description: string;
    onDescription: (value: string) => void;
    materials: string;
    onMaterials: (value: string) => void;
    resumeName: string;
    onResume: (file: File | null) => void;
    experienceLevel: string;
    onExperience: (value: string) => void;
    persona: string;
    onPersona: (value: string) => void;
    practiceMode: string;
    onPractice: (value: string) => void;
    difficulty: string;
    onDifficulty: (value: string) => void;
    durationMinutes: number;
    onMinutes: (value: number) => void;
    pending: boolean;
    onPrepare: () => void;
    api: (input: string, init?: RequestInit) => Promise<Response>;
}) {
    const [companies, setCompanies] = useState<string[]>([]);
    const [open, setOpen] = useState(false);
    const [companyFocus, setCompanyFocus] = useState(false);
    useEffect(() => {
        void props.api("http://localhost:3000/api/v1/interviews/companies").then(async (response) => {
            if (response.ok) {
                setCompanies(await response.json() as string[]);
            }
        });
    }, [props.api]);
    const matches = props.company.trim().length < 1 ? [] : companies.filter((name) => name.toLowerCase().includes(props.company.trim().toLowerCase())).slice(0, 6);
    return (
        <section className="launcher">
            <h2>New Interview Session</h2>
            <div className="pills">
                {PILLS.map((pill) => (
                    <button key={pill.id} type="button" className={props.interviewType === pill.id ? "pill on" : "pill"} onClick={() => props.onType(pill.id)}>{pill.label}</button>
                ))}
            </div>
            <div className="launcher-fields">
                <label className="company-field">
                    {props.mode === "job" ? "Company" : "Skills"}
                    {props.mode === "job" ? (
                        <input
                            value={props.company}
                            placeholder="Search a company, or type one"
                            onFocus={() => setCompanyFocus(true)}
                            onBlur={() => window.setTimeout(() => setCompanyFocus(false), 150)}
                            onChange={(event) => props.onCompany(event.target.value)}
                        />
                    ) : (
                        <input value={props.skills} placeholder="JavaScript, React" onChange={(event) => props.onSkills(event.target.value)} />
                    )}
                    {props.mode === "job" && companyFocus && matches.length > 0 ? (
                        <ul className="suggest">
                            {matches.map((name) => (
                                <li key={name}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => props.onCompany(name)}>{name}</button></li>
                            ))}
                        </ul>
                    ) : null}
                </label>
                <label>
                    Role
                    <input value={props.role} onChange={(event) => props.onRole(event.target.value)} />
                </label>
            </div>
            {open ? (
                <div className="materials">
                    <label>
                        Job requirements
                        <input value={props.description} onChange={(event) => props.onDescription(event.target.value)} />
                    </label>
                    <label>
                        Notes for this interview
                        <textarea rows={4} value={props.materials} placeholder="Paste a job description or the topics you want. Names in the notes are passed to Whisper." onChange={(event) => props.onMaterials(event.target.value)} />
                    </label>
                    <label>
                        Resume
                        <input type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" onChange={(event) => props.onResume(event.target.files?.[0] ?? null)} />
                    </label>
                    {props.resumeName ? <p>{props.resumeName} is ready.</p> : null}
                    <div className="launcher-fields">
                        <label>
                            Experience
                            <select value={props.experienceLevel} onChange={(event) => props.onExperience(event.target.value)}>
                                <option value="entry">Entry</option>
                                <option value="mid">Mid</option>
                                <option value="senior">Senior</option>
                            </select>
                        </label>
                        <label>
                            Minutes
                            <input type="number" min={10} value={props.durationMinutes} onChange={(event) => props.onMinutes(Number(event.target.value))} />
                        </label>
                        <label>
                            Interviewer
                            <select value={props.persona} onChange={(event) => props.onPersona(event.target.value)}>
                                <option value="coach">Friendly coach</option>
                                <option value="recruiter">Neutral recruiter</option>
                                <option value="bar_raiser">Bar raiser</option>
                            </select>
                        </label>
                        <label>
                            Practice
                            <select value={props.practiceMode} onChange={(event) => props.onPractice(event.target.value)}>
                                <option value="coach">Coach mode</option>
                                <option value="real">Real mode</option>
                            </select>
                        </label>
                        <label>
                            Difficulty
                            <select value={props.difficulty} onChange={(event) => props.onDifficulty(event.target.value)}>
                                <option value="easy">Easy</option>
                                <option value="medium">Medium</option>
                                <option value="hard">Hard</option>
                            </select>
                        </label>
                    </div>
                </div>
            ) : null}
            <div className="launcher-foot">
                <button type="button" className="drawer" onClick={() => props.onMode(props.mode === "job" ? "skill" : "job")}>
                    {props.mode === "job" ? "Practice a skill instead" : "Practice for a company"}
                </button>
                <button type="button" className="drawer" onClick={() => setOpen((value) => !value)}>{open ? "Hide materials" : "Add a job description or resume"}</button>
                <button type="button" className="prepare" disabled={props.pending} onClick={props.onPrepare}>{props.pending ? "Preparing your interview…" : "Prepare Room →"}</button>
            </div>
        </section>
    );
}
