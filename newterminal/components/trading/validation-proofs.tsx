'use client';

import { useState } from 'react';
import { ShieldCheck, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { EtherscanLink } from './etherscan-link';
import type { Attestation } from '@/lib/trading-types';

interface ValidationProofsProps {
  attestations: Attestation[];
}

export function ValidationProofs({ attestations }: ValidationProofsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const recentAttestations = attestations.slice(0, 5);

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-success bg-success/20 border-success/30';
    if (score >= 70) return 'text-primary bg-primary/20 border-primary/30';
    if (score >= 50) return 'text-warning bg-warning/20 border-warning/30';
    return 'text-destructive bg-destructive/20 border-destructive/30';
  };

  const getScoreGlow = (score: number) => {
    if (score >= 90) return 'shadow-[0_0_12px_rgba(16,185,129,0.3)]';
    return '';
  };

  return (
    <div className="glass-panel rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h3 className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">
          On-Chain Proofs
        </h3>
      </div>

      {/* Proof Chain */}
      <div className="space-y-3">
        {recentAttestations.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No attestations yet
          </div>
        ) : (
          recentAttestations.map((attestation, index) => {
            const hash = attestation.checkpointHash ?? attestation.intentHash ?? '—';
            const isExpanded = expandedId === hash;
            
            return (
              <div
                key={hash + index}
                className={`relative animate-slide-in border-l-2 ${attestation.txid ? 'border-l-success/40' : 'border-l-primary/40'} rounded-r-lg transition-all duration-200`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Chain connector */}
                {index < recentAttestations.length - 1 && (
                  <div className="absolute left-4 top-12 w-0.5 h-6 bg-border" />
                )}
                
                <div className="flex items-start gap-3 p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors">
                  {/* Status icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    attestation.txid ? 'bg-success/20' : 'bg-warning/20'
                  }`}>
                    {attestation.txid ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : (
                      <Clock className="w-4 h-4 text-warning" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Hash & Score */}
                    <div className="flex items-center justify-between gap-2">
                      <EtherscanLink hash={hash} className="text-xs bg-secondary px-2 py-1 rounded truncate max-w-[180px]" />
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono font-semibold ${getScoreColor(attestation.score)} ${getScoreGlow(attestation.score)}`}>
                        {attestation.score}
                      </div>
                    </div>

                    {/* Notes */}
                    {attestation.notes && (
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{attestation.notes}</p>
                    )}

                    {/* Validator & Time */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>Validator:</span>
                        <a 
                          href={`https://sepolia.etherscan.io/address/${attestation.validator}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono hover:text-primary transition-colors"
                        >
                          {attestation.validator.slice(0, 6)}...{attestation.validator.slice(-4)}
                        </a>
                      </div>
                      <span>{formatTimeAgo(attestation.timestamp)}</span>
                    </div>

                    {/* Etherscan link */}
                    {attestation.txid && (
                      <EtherscanLink
                        hash={attestation.txid}
                        type="tx"
                        label="View on Etherscan"
                        className="text-xs"
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  );
}
