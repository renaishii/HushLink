import { createConfig, createStorage, cookieStorage, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(),
  },
  storage: createStorage({ storage: cookieStorage }),
  ssr: false,
});
