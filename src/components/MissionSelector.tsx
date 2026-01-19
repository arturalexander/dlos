'use client';

interface MissionSelectorProps {
    missions: { id: string; name: string; date: string }[];
    selectedId: string;
    onSelect: (id: string) => void;
}

export default function MissionSelector({ missions, selectedId, onSelect }: MissionSelectorProps) {
    return (
        <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm text-gray-400">Misión:</label>
            <select
                value={selectedId}
                onChange={(e) => onSelect(e.target.value)}
                className="px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:border-emerald-500 min-w-[200px]"
            >
                {missions.map((mission) => (
                    <option key={mission.id} value={mission.id}>
                        {mission.name} - {new Date(mission.date).toLocaleDateString('es-ES')}
                    </option>
                ))}
            </select>
        </div>
    );
}
