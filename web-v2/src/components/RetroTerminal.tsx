import { useEffect, useRef, useState } from 'react';

import { getAgentDisplayName } from '../agentDisplay.js';
import { apiUrl } from '../backend.js';
import type { BackendAgent } from '../operationalState.js';
import './RetroTerminal.css';

interface Message {
  role: 'user' | 'agent';
  text: string;
}

interface RetroTerminalProps {
  agent: BackendAgent | null;
  logs: string[];
  onClose: () => void;
  onStartTask: (id: string, taskInput: string) => void;
  currentInstanceLabel?: string | null;
}

export function RetroTerminal({
  agent,
  logs,
  onClose,
  onStartTask,
  currentInstanceLabel = null,
}: RetroTerminalProps) {
  const [activeTab, setActiveTab] = useState<'logs' | 'chat'>('logs');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [taskInput, setTaskInput] = useState('');

  const logsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, chatMessages, activeTab]);

  if (!agent) return null;
  const agentLabel = getAgentDisplayName(agent);

  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMsg: Message = { role: 'user', text: chatInput };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    try {
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, message: chatInput }),
      });
      const data = await response.json();
      const agentMsg: Message = { role: 'agent', text: data.reply };
      setChatMessages((prev) => [...prev, agentMsg]);
    } catch (error) {
      console.error(error);
      setChatMessages((prev) => [
        ...prev,
        { role: 'agent', text: '[ERRO DE CONEXAO COM O CEREBRO]' },
      ]);
    }
    setIsTyping(false);
  };

  return (
    <div className="retro-terminal-overlay">
      <div className="retro-terminal">
        <div className="terminal-header">
          <div className="terminal-title">
            <span className="blink">_</span> {agentLabel}
            {currentInstanceLabel ? <span className="terminal-scope">@ {currentInstanceLabel}</span> : null}
          </div>
          <div className="terminal-tabs">
            <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>[LOGS]</button>
            <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>[CHAT]</button>
          </div>
          <button className="terminal-close" onClick={onClose}>[X]</button>
        </div>

        {activeTab === 'logs' ? (
          <div className="terminal-body">
            {logs.map((log, index) => (
              <div key={index} className={`log-line ${log.includes('[ERROR]') ? 'log-error' : ''}`}>
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        ) : (
          <div className="terminal-body chat-body">
            {chatMessages.map((message, index) => (
              <div key={index} className={`chat-line ${message.role}`}>
                <span className="chat-role">{message.role === 'user' ? 'YOU' : agent.id.toUpperCase()}:</span>
                <span className="chat-text">{message.text}</span>
              </div>
            ))}
            {isTyping && <div className="chat-line agent"><span className="blink">... digitando ...</span></div>}
            <div ref={chatEndRef} />
          </div>
        )}

        <div className="terminal-footer">
          <span className="prompt">{activeTab === 'logs' ? `root@${agent.id}:~$` : '>'}</span>
          <input
            type="text"
            className="terminal-input"
            placeholder={activeTab === 'logs' ? 'Digite uma tarefa para o agente...' : 'Diga algo para o agente...'}
            value={activeTab === 'logs' ? taskInput : chatInput}
            onChange={(event) =>
              activeTab === 'logs' ? setTaskInput(event.target.value) : setChatInput(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (activeTab === 'logs' && taskInput.trim()) {
                  onStartTask(agent.id, taskInput);
                  setTaskInput('');
                } else if (activeTab === 'chat' && chatInput.trim()) {
                  void handleSendChatMessage();
                }
              }
            }}
          />
          <button
            className="terminal-btn"
            onClick={() => {
              if (activeTab === 'logs' && taskInput.trim()) {
                onStartTask(agent.id, taskInput);
                setTaskInput('');
              } else if (activeTab === 'chat' && chatInput.trim()) {
                void handleSendChatMessage();
              }
            }}
          >
            {activeTab === 'logs' ? 'EXECUTE' : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  );
}
