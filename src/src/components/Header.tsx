import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-left">
            <h1 className="header-title">
              HushLink
            </h1>
            <p className="header-subtitle">Send private messages with an FHE-encrypted key address.</p>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
