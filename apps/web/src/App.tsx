import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

type CreatedInterview={
    id: string;
    status: string;
    title?: string;
}
type InterviewTurn={
    status: string;
    sectionName: string;
    prompt: string;
    done: boolean;
};
type InterviewReport={
    status: string;
    overallScore: number;
    strengths: string[];
}

export default function App(){
    const [result, setResult]=useState<CreatedInterview|null>(null);
    const [error, setError]=useState("");

    const [turn, setTurn]=useState<InterviewTurn|null>(null);

    const [answer, setAnswer]=useState("");
    const [code, setCode]=useState("");

    const [report, setReport]=useState<InterviewReport|null>(null);

    const videoRef=useRef<HTMLVideoElement>(null);
    const [cameraReady, setCameraReady]=useState(false);
    const screenRef=useRef<HTMLVideoElement>(null);
    
    useEffect(()=>{
        return ()=>{
         for(const element of [videoRef.current, screenRef.current]){
            const stream=element?.srcObject;
            if(stream instanceof MediaStream){
                stream.getTracks().forEach((track)=>track.stop());
            }
         }
       }
    },[])
    useEffect(()=>{
        if(!turn?.prompt){
            return;
        }
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(turn.prompt));
        return()=>{
            window.speechSynthesis.cancel();
        }
    }, [turn])

    function listenForAnswer(){
        window.speechSynthesis.cancel();
        const speechWindow=window as Window & {
            SpeechRecognition?: new()=>{
                lang: string;
                start: ()=>void;
                onresult:((event: {results: ArrayLike<ArrayLike<{transcript: string}>>})=> void) | null;
                onerror:(()=> void) | null;
            };
            webkitSpeechRecognition?: new()=>{
                lang: string;
                start: ()=> void;
                onresult:((event: {results: ArrayLike<ArrayLike<{transcript: string}>>})=> void) | null;
                onerror: (()=> void)| null;
            };
        };
        const Recognition=speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
        if(!Recognition){
            setError("Speech recognition is not available in the browser. Type the answer instead.")
            return;
        }
        const recognition= new Recognition();
        recognition.lang="en-US";
        recognition.onresult=(event)=>{
            setAnswer(event.results[0][0].transcript);
        };
        recognition.onerror=()=>{
            setError("Could not hear an answer. Type it instead.");
        };
        recognition.start();

    }
    async function startCamera(){
        setError("");
        try{
            const stream=await navigator.mediaDevices.getUserMedia({
                video: true,
                audio:false,
            });
            if(videoRef.current){
                videoRef.current.srcObject=stream;
            }
            setCameraReady(true);
        }catch{
            setCameraReady(false);
            setError("Camera is required before the interview can start.")
        }
    }
    async function stopCamera(){
        const stream=videoRef.current?.srcObject;
        if(stream instanceof MediaStream){
            stream.getTracks().forEach((track)=>track.stop());
        }
        if(videoRef.current){
            videoRef.current.srcObject=null;
        }
        setCameraReady(false);
    }
    async function shareScreen() {
        setError("");
        const current = screenRef.current?.srcObject;
        if (current instanceof MediaStream) {
          current.getTracks().forEach((track) => track.stop());
        }
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          if (screenRef.current) {
            screenRef.current.srcObject = stream;
          }
          const track = stream.getVideoTracks()[0];
          track.onended = () => {
            if (screenRef.current) {
              screenRef.current.srcObject = null;
            }
          };
        } catch {
          setError("Screen sharing was cancelled.");
        }
      }
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
    async function startInterview(){
        if(!result){
            return;
        }
        setError("");
        const response=await fetch(
            `http://localhost:3000/api/v1/interviews/${result.id}/start`,
            {method: "POST"},
        );
        if(!response.ok){
            setError(`Start failed: ${response.status}`);
            return;
        }
        const next=await response.json();
        setTurn(next);
        setResult({...result, status: next.status});
    }
    async function submitAnswer(){
        if(!result || !turn || turn.done){
            return;
        }
        setError("");
        const combined = [answer.trim(), code.trim()].filter(Boolean).join("\n\n");
        const response=await fetch(
            `http://localhost:3000/api/v1/interviews/${result.id}/answer`,
            {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({answer: combined}),
            },
        );
        if(!response.ok){
            setError(`Answer failed: ${response.status}`);
            return;
        }
        const next=await response.json();
        setTurn(next);
        setResult({...result, status: next.status});
        setAnswer("");
        setCode("");
        if(next.done){
            stopCamera();
            window.speechSynthesis.cancel();
        }
    }
    async function loadReport(){
        if(!result){
            return;
        }
        setError("");
        const response=await fetch(
            `http://localhost:3000/api/v1/interviews/${result.id}/report`,
            {method: "POST"},
        );
        if(!response.ok){
            setError(`Report failed: ${response.status}`);
            return;
        }
        const next=await response.json();
        setReport(next);
        setResult({...result, status: next.status});
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
          <br/>
          <button type="button" onClick={startCamera}>Turn camera on</button>
          <video ref={videoRef} autoPlay playsInline muted />
          <button type="button" onClick={startInterview} disabled={!cameraReady}>Start interview</button>
          {turn ? (
            <>
            <p>
                {turn.sectionName} : {turn.prompt}
            </p>
            {turn.done ? (
                <button type="button" onClick={loadReport}>Load report</button>
            ) : (
                <>
                <Editor
                    height="240px"
                    defaultLanguage="typescript"
                    theme="vs-dark"
                    value={code}
                    onChange={(value) => setCode(value ?? "")}
                />
                
                <form onSubmit={(event)=>{event.preventDefault(); submitAnswer();}}>
                     <button type="button" onClick={listenForAnswer}>
                        Speak your answer
                    </button>
                    <textarea value={answer} onChange={(event)=>setAnswer(event.target.value)}/>
                    <button type="submit">Submit</button>

                </form>
                </>
            )}
            {report? (
                <p>
                    Score {report.overallScore}. {report.strengths.join(", ")}
                </p>
            ): null}
            </>
          ): null}
        </p>
      ) : null}
    </main>
    );
}