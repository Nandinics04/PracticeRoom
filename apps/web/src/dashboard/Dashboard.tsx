import { useState, type ComponentProps } from "react";
import "./dashboard.css";
import { BrushUpChecklist } from "./BrushUpChecklist";
import { PerformanceBentoGrid, SkillPillarSummary } from "./PerformanceBentoGrid";
import { SavedSessionsTable } from "./SavedSessionsTable";
import { SessionLauncherCard } from "./SessionLauncherCard";
import { StudioNavbar } from "./StudioNavbar";
import type { RoomSummary, StudioView } from "./types";

export function Dashboard(props: {
    name: string;
    spokenName: string;
    onSpokenName: (value: string) => void;
    onSignOut: () => void;
    rooms: RoomSummary[];
    error: string;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
    onRetake: (room: RoomSummary) => void;
    onPracticeTopic: (topic: string) => void;
    launcher: ComponentProps<typeof SessionLauncherCard>;
    view: StudioView;
    onView: (view: StudioView) => void;
}) {
    const view = props.view;
    const [done, setDone] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem("practice-room-brush") || "[]") as string[];
        } catch {
            return [];
        }
    });
    const topics = props.rooms.flatMap((room) => (room.brushUp ?? []).map((topic) => ({ topic, title: room.title || "Interview" })));
    const unique = topics.filter((item, index) => topics.findIndex((other) => other.topic === item.topic) === index);
    const openCount = unique.filter((item) => !done.includes(item.topic)).length;
    function toggle(topic: string) {
        const next = done.includes(topic) ? done.filter((item) => item !== topic) : [...done, topic];
        setDone(next);
        localStorage.setItem("practice-room-brush", JSON.stringify(next));
    }
    return (
        <div className="studio">
            <StudioNavbar view={view} onView={props.onView} brushCount={openCount} name={props.name} spokenName={props.spokenName} onSpokenName={props.onSpokenName} onSignOut={props.onSignOut} />
            {props.error ? <p className="studio-error">{props.error}</p> : null}
            {view === "banks" ? (
                <section className="banks">
                    <h2>Question banks</h2>
                    <p>When you name a company and do not paste notes, public Land the Lab questions for that company are used if the company is in the list.</p>
                    <p>When you paste notes or a resume, only those notes are read. The company list is not searched.</p>
                </section>
            ) : (
                <div className={view === "overview" ? "studio-grid" : "studio-grid single"}>
                    <div>
                        {view === "overview" ? <SessionLauncherCard {...props.launcher} /> : null}
                        {view !== "brush" ? <SavedSessionsTable rooms={props.rooms} onOpen={props.onOpen} onRetake={props.onRetake} onDelete={props.onDelete} preview={view === "overview"} onSeeAll={() => props.onView("rooms")} /> : null}
                        {view === "brush" ? <BrushUpChecklist topics={unique} done={done} onToggle={toggle} onPractice={props.onPracticeTopic} /> : null}
                    </div>
                    {view === "overview" ? (
                        <aside>
                            <PerformanceBentoGrid rooms={props.rooms} />
                            <BrushUpChecklist topics={unique.slice(0, 4)} done={done} onToggle={toggle} onPractice={props.onPracticeTopic} />
                            <SkillPillarSummary rooms={props.rooms} />
                            <p className="privacy">The camera checks whether one face was in frame at the end of an answer, on this device. Accent, appearance, and emotion are not scored.</p>
                        </aside>
                    ) : null}
                </div>
            )}
        </div>
    );
}
