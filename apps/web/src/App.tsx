import { useState } from "react";

type CreatedInterview={
    id: string;
    status: string;
    title?: string;
}

export default function App(){
    const [result, setResult]=useState<CreatedInterview|null>(null);
    const [error, setError]=useState("");

    async function createInterview(){
        setError("");
        const response=await fetch("http://localhost:3000/api/v1/interviews", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                mode: "job",
                company: "Google",
                role: "Software Engineer",
                description: "Build reliable backend services.",
                interviewType: "technical",
                experienceLevel: "mid",
                difficulty: "medium",
                durationMinutes: 30,
            }),
        });
        if(!response.ok){
            setError(`Create failed: ${response.status}`);
            return;
        }
        setResult(await response.json());
    }
    return(
        <main>
      <h1>PracticeRoom</h1>
      <button type="button" onClick={createInterview}>
        Create interview
      </button>
      {error ? <p>{error}</p> : null}
      {result ? (
        <p>
          {result.id} is {result.status}
          {result.title ? `: ${result.title}` : ""}
        </p>
      ) : null}
    </main>
    );
}