import { Typography } from "@mui/material";
import React, { useState } from "react";
import styles from "./SettingsPanel.module.css";

interface SettingsPanelProps {
    tools: string[];
    onChange: (selectedTools: string[]) => void;
}

const SettingsPanel = ({tools, onChange}: SettingsPanelProps) => {
    const [selectedTools, setSelectedTools] = useState<string[]>([]);

    const handleToolSelection = (tool: string) => {
        if (selectedTools.includes(tool)) {
            setSelectedTools(selectedTools.filter((selectedTool) => selectedTool !== tool));
        } else {
            setSelectedTools([...selectedTools, tool]);
        }
        onChange(selectedTools);
    };

    return (
        <div className={styles.panel}>
            <Typography className={styles.header}>Settings</Typography>
            <div className={styles.divider}/>
            <div className={styles.toolslist}>
                {tools.map((tool) => (
                    <div key={tool}>
                        <input
                            type="checkbox"
                            id={tool}
                            name={tool}
                            checked={selectedTools.includes(tool)}
                            onChange={() => handleToolSelection(tool)}
                        />
                        <label htmlFor={tool}>{tool}</label>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SettingsPanel;