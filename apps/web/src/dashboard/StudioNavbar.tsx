import { useEffect, useState } from "react";
import type { StudioView } from "./types";

const VIEWS: { id: StudioView; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "rooms", label: "Saved Rooms" },
    { id: "brush", label: "Brush-Up Queue" },
    { id: "banks", label: "Question Banks" },
];

export function StudioNavbar({
    view,
    onView,
    brushCount,
    name,
    spokenName,
    onSpokenName,
    onSignOut,
}: {
    view: StudioView;
    onView: (view: StudioView) => void;
    brushCount: number;
    name: string;
    spokenName: string;
    onSpokenName: (value: string) => void;
    onSignOut: () => void;
}) {
    const [mic, setMic] = useState("checking the mic");
    const [editing, setEditing] = useState(false);
    useEffect(() => {
        let cancel = false;
        navigator.mediaDevices?.enumerateDevices().then((devices) => {
            if (!cancel) {
                setMic(devices.some((device) => device.kind === "audioinput") ? "mic available" : "allow the mic in the room");
            }
        }).catch(() => {
            if (!cancel) {
                setMic("allow the mic in the room");
            }
        });
        return () => {
            cancel = true;
        };
    }, []);
    return (
        <header className="studio-nav">
            <p className="studio-brand"><span>pR</span> practiceRoom</p>
            <p className="studio-crumb">Studio / {VIEWS.find((item) => item.id === view)?.label}</p>
            <nav className="studio-tabs">
                {VIEWS.map((item) => (
                    <button key={item.id} type="button" className={view === item.id ? "tab on" : "tab"} onClick={() => onView(item.id)}>
                        {item.label}
                        {item.id === "brush" && brushCount > 0 ? <em>{brushCount}</em> : null}
                    </button>
                ))}
            </nav>
            <p className="engine"><i />Kokoro af_heart · {mic}</p>
            <div className="studio-user">
                {editing ? (
                    <input
                        value={spokenName}
                        placeholder={name || "Name Kokoro should say"}
                        onChange={(event) => onSpokenName(event.target.value)}
                        onBlur={() => setEditing(false)}
                    />
                ) : (
                    <button type="button" onClick={() => setEditing(true)}>{name || "You"}</button>
                )}
                <button type="button" onClick={onSignOut}>Sign out</button>
            </div>
        </header>
    );
}
