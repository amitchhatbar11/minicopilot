import type { Preset } from './types.js';

/**
 * Pre-configured Bitcoin spending templates. Timelock conventions:
 *   144 blocks ≈ 1 day, 1008 ≈ 1 week, 4320 ≈ 30 days, 12960 ≈ 90 days,
 *   52560 ≈ 1 year. `older` = relative (CSV), `after` = absolute (CLTV).
 */
export const PRESETS: Preset[] = [
  {
    id: 'multisig-decay',
    title: 'Shared wallet with a backup plan',
    description:
      '2 of 3 people must approve. If the funds sit untouched for 90 days, either of 2 backup keys can recover them.',
    prompt:
      'Funds need 2 of 3 keys (alice, bob, carol) to spend. But if 90 days pass, allow spending with just 1 of the two recovery keys dave or erin.',
  },
  {
    id: 'inheritance',
    title: 'Inheritance plan',
    description:
      'You can spend any time. If you go a full year without moving the coins, your heir can claim them.',
    prompt:
      'I (owner) can spend at any time. If I have not moved the coins for 1 year, my heir should be able to spend them alone.',
  },
  {
    id: 'lightning-htlc',
    title: 'Lightning payment (HTLC)',
    description:
      'The receiver gets paid by revealing a secret code; otherwise the sender gets a refund after about a day.',
    prompt:
      'A Lightning HTLC: the receiver can claim the funds by revealing the SHA256 preimage of 6c60f404f8167a38fc70eaf8aa17ac351023bef86bcb9d1086a19afe95bd5333 together with their signature (receiver_key). Otherwise the sender (sender_key) can reclaim after 144 blocks. Also a revocation_key can spend immediately at any time.',
  },
  {
    id: 'cold-2fa-escape',
    title: 'Cold storage + 2FA',
    description:
      'Spending needs both your vault key and your 2FA key. In an emergency, a backup key works alone after 30 days.',
    prompt:
      'Normal spending requires both my cold storage key and my 2FA key together. As an emergency escape, a single backup key may spend by itself, but only after 30 days have passed.',
  },
];
