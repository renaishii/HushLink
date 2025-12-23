import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Header } from './Header';
import { SendMessage } from './SendMessage';
import { Inbox } from './Inbox';
import '../styles/HushLinkApp.css';

type Tab = 'send' | 'inbox';

// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function HushLinkApp() {
  const { isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<Tab>('send');

  const contractConfigured = true;

  return (
    <div className="hushlink-app">
      <Header />

      <main className="hushlink-main">
        <div className="hushlink-shell">
          {!contractConfigured ? (
            <div className="hushlink-alert">
              <h2 className="hushlink-alert-title">Contract not configured</h2>
              <p className="hushlink-alert-text">
                `CONTRACT_ADDRESS` is still the zero address. Deploy to Sepolia and sync the address + ABI into the
                frontend config.
              </p>
            </div>
          ) : null}

          {!isConnected ? (
            <div className="hushlink-alert" style={{ marginTop: contractConfigured ? 0 : '1rem' }}>
              <h2 className="hushlink-alert-title">Connect your wallet</h2>
              <p className="hushlink-alert-text">
                Sending and decrypting messages requires signing with your wallet (no local storage is used).
              </p>
            </div>
          ) : null}

          <div className="hushlink-card">
            <div className="hushlink-tabs">
              <button
                type="button"
                className={`hushlink-tab ${activeTab === 'send' ? 'active' : ''}`}
                onClick={() => setActiveTab('send')}
              >
                Send
              </button>
              <button
                type="button"
                className={`hushlink-tab ${activeTab === 'inbox' ? 'active' : ''}`}
                onClick={() => setActiveTab('inbox')}
              >
                Inbox
              </button>
            </div>

            <div className="hushlink-content">
              {activeTab === 'send' ? <SendMessage /> : null}
              {activeTab === 'inbox' ? <Inbox /> : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
