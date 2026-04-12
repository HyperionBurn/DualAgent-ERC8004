'use client';

import { ExternalLink } from 'lucide-react';

interface EtherscanLinkProps {
  hash: string;
  type?: 'tx' | 'address';
  label?: string;
  className?: string;
}

export function EtherscanLink({ hash, type = 'tx', label, className }: EtherscanLinkProps) {
  const baseUrl = 'https://sepolia.etherscan.io';
  const href = `${baseUrl}/${type}/${hash}`;
  const display = label ?? `${hash.slice(0, 10)}...${hash.slice(-6)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-primary/70 hover:text-primary transition-colors font-mono ${className ?? ''}`}
      title={`View on Sepolia Etherscan: ${hash}`}
    >
      {display}
      <ExternalLink className="w-3 h-3 opacity-50" />
    </a>
  );
}
