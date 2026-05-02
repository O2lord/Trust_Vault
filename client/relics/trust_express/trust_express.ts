/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trust_vault.json`.
 */
export type TrustVault = {
  "address": "6Z8rRkDxtLWBEGgeccx8AWj9Um8osnLQihEA1xiECHWr",
  "metadata": {
    "name": "trustVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancelOrReduceBuyOrder",
      "discriminator": [
        212,
        68,
        226,
        170,
        186,
        51,
        83,
        18
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "trust_express.maker",
                "account": "trustExpress"
              },
              {
                "kind": "account",
                "path": "trust_express.seed",
                "account": "trustExpress"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "newAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimValidatorFees",
      "docs": [
        "Validators call this to withdraw their accumulated fee earnings for a",
        "specific token mint. Transfers from the validator fee pool ATA to the",
        "validator's own ATA and resets their accumulated balance to zero."
      ],
      "discriminator": [
        153,
        132,
        30,
        181,
        219,
        90,
        236,
        128
      ],
      "accounts": [
        {
          "name": "validator",
          "docs": [
            "The validator claiming their fees — must match validator_earnings.validator"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "globalState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "validatorEarnings",
          "docs": [
            "The validator's earnings ledger for this mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  111,
                  114,
                  45,
                  101,
                  97,
                  114,
                  110,
                  105,
                  110,
                  103,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "validator"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "validatorFeePoolAuthority",
          "docs": [
            "The dedicated pool authority PDA — signs transfers out of the pool ATA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  111,
                  114,
                  45,
                  102,
                  101,
                  101,
                  45,
                  112,
                  111,
                  111,
                  108,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "validatorFeePoolAta",
          "docs": [
            "The pool ATA holding pending validator earnings for this mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "validatorFeePoolAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "validatorAta",
          "docs": [
            "The validator's own ATA — receives the claimed tokens"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "validator"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closeExecutedVote",
      "discriminator": [
        158,
        151,
        86,
        33,
        230,
        157,
        183,
        113
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone can call — they receive the vote account rent as reward"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "validatorVote",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "confirmPayout",
      "discriminator": [
        148,
        97,
        145,
        2,
        85,
        139,
        4,
        140
      ],
      "accounts": [
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "trust_express.maker",
                "account": "trustExpress"
              },
              {
                "kind": "account",
                "path": "trust_express.seed",
                "account": "trustExpress"
              }
            ]
          }
        },
        {
          "name": "botAuthority",
          "signer": true
        },
        {
          "name": "maker"
        },
        {
          "name": "mint"
        },
        {
          "name": "trustExpressAta",
          "writable": true
        },
        {
          "name": "feeDestinationAta"
        },
        {
          "name": "takerAta"
        },
        {
          "name": "makerAta"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "taker",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "fiatAmount",
          "type": "u64"
        },
        {
          "name": "currency",
          "type": "string"
        },
        {
          "name": "payoutReference",
          "type": "string"
        },
        {
          "name": "success",
          "type": "bool"
        },
        {
          "name": "message",
          "type": "string"
        }
      ]
    },
    {
      "name": "confirmSellPayment",
      "discriminator": [
        28,
        148,
        26,
        79,
        107,
        87,
        193,
        139
      ],
      "accounts": [
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "trust_express.maker",
                "account": "trustExpress"
              },
              {
                "kind": "account",
                "path": "trust_express.seed",
                "account": "trustExpress"
              }
            ]
          }
        },
        {
          "name": "botAuthority",
          "signer": true
        },
        {
          "name": "maker",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "trustExpressAta",
          "writable": true
        },
        {
          "name": "feeDestinationAta",
          "writable": true
        },
        {
          "name": "takerAta",
          "writable": true
        },
        {
          "name": "makerAta",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "taker",
          "type": "pubkey"
        },
        {
          "name": "payoutReference",
          "type": "string"
        },
        {
          "name": "success",
          "type": "bool"
        },
        {
          "name": "message",
          "type": "string"
        }
      ]
    },
    {
      "name": "createExpressBuyOrder",
      "discriminator": [
        90,
        125,
        14,
        55,
        71,
        235,
        216,
        109
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "arg",
                "path": "seed"
              }
            ]
          }
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "seed",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "pricePerToken",
          "type": "u64"
        },
        {
          "name": "currency",
          "type": "string"
        },
        {
          "name": "paymentInstructions",
          "type": "string"
        },
        {
          "name": "flutterwaveCredentialId",
          "type": "string"
        }
      ]
    },
    {
      "name": "createExpressSell",
      "discriminator": [
        211,
        203,
        237,
        187,
        77,
        166,
        246,
        120
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "sellerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "arg",
                "path": "seed"
              }
            ]
          }
        },
        {
          "name": "trustExpressAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustExpress"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "seed",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "pricePerToken",
          "type": "u64"
        },
        {
          "name": "currency",
          "type": "string"
        },
        {
          "name": "paymentInstructions",
          "type": "string"
        },
        {
          "name": "flutterwaveCredentialId",
          "type": "string"
        }
      ]
    },
    {
      "name": "expressWithdraw",
      "discriminator": [
        232,
        94,
        38,
        122,
        232,
        99,
        98,
        126
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true,
          "relations": [
            "trustExpress"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "trustExpress"
          ]
        },
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "trust_express.seed",
                "account": "trustExpress"
              }
            ]
          }
        },
        {
          "name": "trustExpressAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustExpress"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "makerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "withdrawAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalizeExpiredVote",
      "docs": [
        "Anyone can call this after a vote account has expired without consensus.",
        "Always triggers a full refund to the taker."
      ],
      "discriminator": [
        128,
        212,
        175,
        186,
        37,
        139,
        247,
        253
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone can call — they receive the vote account's rent as reward"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "validatorVote",
          "writable": true
        },
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "trust_express.maker",
                "account": "trustExpress"
              },
              {
                "kind": "account",
                "path": "trust_express.seed",
                "account": "trustExpress"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "trustExpressAta",
          "writable": true
        },
        {
          "name": "takerAta",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "payoutReference",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeGlobalState",
      "discriminator": [
        232,
        254,
        209,
        244,
        123,
        89,
        154,
        207
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "instantReserve",
      "discriminator": [
        49,
        131,
        230,
        138,
        27,
        60,
        108,
        209
      ],
      "accounts": [
        {
          "name": "trustExpress",
          "writable": true
        },
        {
          "name": "maker",
          "relations": [
            "trustExpress"
          ]
        },
        {
          "name": "taker",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "takerAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "taker"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "trustExpressAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustExpress"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "globalState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "fiatAmount",
          "type": "u64"
        },
        {
          "name": "currency",
          "type": "string"
        },
        {
          "name": "payoutDetails",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "instantSellReserve",
      "discriminator": [
        52,
        125,
        233,
        43,
        54,
        91,
        93,
        187
      ],
      "accounts": [
        {
          "name": "trustExpress",
          "writable": true
        },
        {
          "name": "maker",
          "relations": [
            "trustExpress"
          ]
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "globalState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "paymentMode",
          "type": "u8"
        },
        {
          "name": "payoutDetails",
          "type": {
            "option": "string"
          }
        },
        {
          "name": "payoutReference",
          "type": "string"
        }
      ]
    },
    {
      "name": "pauseBuyOrders",
      "discriminator": [
        52,
        21,
        251,
        234,
        254,
        117,
        47,
        161
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "globalState"
          ]
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "pauseSellOrders",
      "discriminator": [
        156,
        206,
        45,
        210,
        131,
        13,
        16,
        252
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "globalState"
          ]
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "registerValidator",
      "docs": [
        "Register a new validator pubkey into the 5-slot registry.",
        "Only the authority can call this."
      ],
      "discriminator": [
        118,
        98,
        251,
        58,
        81,
        30,
        13,
        240
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Must be the stored authority"
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "globalState"
          ]
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "validatorPubkey",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "removeValidator",
      "docs": [
        "Remove a validator from the registry."
      ],
      "discriminator": [
        25,
        96,
        211,
        155,
        161,
        14,
        168,
        188
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Must be the stored authority"
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "globalState"
          ]
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "validatorPubkey",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setGlobalStats",
      "discriminator": [
        227,
        191,
        213,
        137,
        83,
        151,
        106,
        1
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "globalState"
          ]
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "totalVolume",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "totalConfirmations",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "totalTrustExpressCreated",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "totalTrustExpressClosed",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "totalFeesCollected",
          "type": {
            "option": "u64"
          }
        }
      ]
    },
    {
      "name": "submitBuyVote",
      "docs": [
        "Cast a vote on a buy-order payout (replaces the single-bot confirm_payout)."
      ],
      "discriminator": [
        145,
        58,
        12,
        19,
        219,
        115,
        206,
        51
      ],
      "accounts": [
        {
          "name": "validator",
          "docs": [
            "Must be a registered validator"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "trust_express.maker",
                "account": "trustExpress"
              },
              {
                "kind": "account",
                "path": "trust_express.seed",
                "account": "trustExpress"
              }
            ]
          }
        },
        {
          "name": "validatorVote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  111,
                  114,
                  45,
                  118,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "trustExpress"
              },
              {
                "kind": "arg",
                "path": "referenceHash"
              }
            ]
          }
        },
        {
          "name": "maker",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "trustExpressAta",
          "writable": true
        },
        {
          "name": "feeDestinationAta",
          "writable": true
        },
        {
          "name": "takerAta",
          "writable": true
        },
        {
          "name": "makerAta",
          "writable": true
        },
        {
          "name": "validatorFeePoolAuthority",
          "docs": [
            "Validated against global_state.validator_fee_pool_authority in handler"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  111,
                  114,
                  45,
                  102,
                  101,
                  101,
                  45,
                  112,
                  111,
                  111,
                  108,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "validatorFeePoolAta",
          "docs": [
            "Pool ATA accumulating the validator 20% share for this mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "validatorFeePoolAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "referenceHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "payoutReference",
          "type": "string"
        },
        {
          "name": "taker",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "fiatAmount",
          "type": "u64"
        },
        {
          "name": "currency",
          "type": "string"
        },
        {
          "name": "vote",
          "type": "bool"
        },
        {
          "name": "evidence",
          "type": "string"
        }
      ]
    },
    {
      "name": "submitSellVote",
      "docs": [
        "Cast a vote on a sell-order payment confirmation."
      ],
      "discriminator": [
        232,
        237,
        169,
        169,
        136,
        172,
        31,
        95
      ],
      "accounts": [
        {
          "name": "validator",
          "docs": [
            "Must be a registered validator"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "trust_express.maker",
                "account": "trustExpress"
              },
              {
                "kind": "account",
                "path": "trust_express.seed",
                "account": "trustExpress"
              }
            ]
          }
        },
        {
          "name": "validatorVote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  111,
                  114,
                  45,
                  118,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "trustExpress"
              },
              {
                "kind": "arg",
                "path": "referenceHash"
              }
            ]
          }
        },
        {
          "name": "maker",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "trustExpressAta",
          "writable": true
        },
        {
          "name": "feeDestinationAta",
          "writable": true
        },
        {
          "name": "takerAta",
          "writable": true
        },
        {
          "name": "makerAta",
          "writable": true
        },
        {
          "name": "validatorFeePoolAuthority",
          "docs": [
            "Validated against global_state.validator_fee_pool_authority in handler"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  111,
                  114,
                  45,
                  102,
                  101,
                  101,
                  45,
                  112,
                  111,
                  111,
                  108,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "validatorFeePoolAta",
          "docs": [
            "Pool ATA accumulating the validator 20% share for this mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "validatorFeePoolAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "referenceHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "payoutReference",
          "type": "string"
        },
        {
          "name": "taker",
          "type": "pubkey"
        },
        {
          "name": "vote",
          "type": "bool"
        },
        {
          "name": "evidence",
          "type": "string"
        }
      ]
    },
    {
      "name": "updateFeeDestination",
      "discriminator": [
        233,
        234,
        249,
        55,
        15,
        29,
        217,
        166
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "globalState"
          ]
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "newFeeDestination",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateFeePercentage",
      "discriminator": [
        102,
        119,
        197,
        160,
        139,
        102,
        182,
        0
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "globalState"
          ]
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "newFeePercentage",
          "type": "u16"
        }
      ]
    },
    {
      "name": "updatePrice",
      "discriminator": [
        61,
        34,
        117,
        155,
        75,
        34,
        123,
        208
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true,
          "relations": [
            "trustExpress"
          ]
        },
        {
          "name": "trustExpress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  117,
                  115,
                  116,
                  45,
                  101,
                  120,
                  112,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "trust_express.seed",
                "account": "trustExpress"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newPricePerToken",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateRequiredVotes",
      "docs": [
        "Change the vote threshold (1–5, must not exceed validator_count)."
      ],
      "discriminator": [
        193,
        185,
        173,
        53,
        145,
        114,
        172,
        248
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Must be the stored authority"
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "globalState"
          ]
        },
        {
          "name": "globalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  45,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "requiredVotes",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "globalState",
      "discriminator": [
        163,
        46,
        74,
        168,
        216,
        123,
        133,
        98
      ]
    },
    {
      "name": "trustExpress",
      "discriminator": [
        22,
        110,
        124,
        216,
        223,
        105,
        7,
        33
      ]
    },
    {
      "name": "validatorEarnings",
      "discriminator": [
        124,
        218,
        205,
        81,
        43,
        64,
        250,
        180
      ]
    },
    {
      "name": "validatorVote",
      "discriminator": [
        63,
        68,
        242,
        159,
        202,
        98,
        147,
        175
      ]
    }
  ],
  "events": [
    {
      "name": "buyOrdersPausedEvent",
      "discriminator": [
        237,
        135,
        0,
        171,
        227,
        125,
        213,
        6
      ]
    },
    {
      "name": "expressBuyOrderCancelledEvent",
      "discriminator": [
        117,
        193,
        185,
        13,
        45,
        46,
        116,
        139
      ]
    },
    {
      "name": "expressBuyOrderCreatedEvent",
      "discriminator": [
        188,
        250,
        135,
        197,
        56,
        135,
        220,
        82
      ]
    },
    {
      "name": "expressBuyOrderReducedEvent",
      "discriminator": [
        108,
        101,
        248,
        185,
        162,
        5,
        179,
        33
      ]
    },
    {
      "name": "expressCloseFailedEvent",
      "discriminator": [
        28,
        91,
        60,
        34,
        32,
        87,
        79,
        77
      ]
    },
    {
      "name": "expressClosedEvent",
      "discriminator": [
        4,
        0,
        45,
        30,
        70,
        31,
        156,
        161
      ]
    },
    {
      "name": "expressPartialWithdrawalEvent",
      "discriminator": [
        62,
        205,
        135,
        105,
        121,
        194,
        185,
        36
      ]
    },
    {
      "name": "expressPriceUpdatedEvent",
      "discriminator": [
        136,
        128,
        33,
        209,
        231,
        46,
        245,
        5
      ]
    },
    {
      "name": "expressSellOrderCreatedEvent",
      "discriminator": [
        71,
        107,
        238,
        113,
        181,
        139,
        174,
        53
      ]
    },
    {
      "name": "feeDestinationUpdatedEvent",
      "discriminator": [
        84,
        169,
        39,
        167,
        102,
        86,
        139,
        92
      ]
    },
    {
      "name": "feePercentageUpdatedEvent",
      "discriminator": [
        159,
        56,
        203,
        216,
        111,
        194,
        177,
        206
      ]
    },
    {
      "name": "instantPaymentPayoutQueuedEvent",
      "discriminator": [
        126,
        74,
        232,
        24,
        151,
        193,
        25,
        55
      ]
    },
    {
      "name": "instantPaymentPayoutResultEvent",
      "discriminator": [
        114,
        61,
        126,
        78,
        83,
        230,
        103,
        231
      ]
    },
    {
      "name": "instantPaymentReservedEvent",
      "discriminator": [
        1,
        110,
        251,
        231,
        168,
        10,
        216,
        190
      ]
    },
    {
      "name": "instantSellPaymentResultEvent",
      "discriminator": [
        242,
        224,
        155,
        109,
        131,
        121,
        91,
        134
      ]
    },
    {
      "name": "instantSellReservationCreatedEvent",
      "discriminator": [
        65,
        196,
        145,
        144,
        214,
        136,
        85,
        139
      ]
    },
    {
      "name": "sellOrdersPausedEvent",
      "discriminator": [
        61,
        157,
        167,
        130,
        193,
        42,
        129,
        66
      ]
    },
    {
      "name": "trustExpressNearlyEmptyEvent",
      "discriminator": [
        71,
        43,
        217,
        67,
        145,
        137,
        255,
        85
      ]
    },
    {
      "name": "validatorFeeClaimedEvent",
      "discriminator": [
        171,
        228,
        79,
        129,
        217,
        158,
        255,
        216
      ]
    },
    {
      "name": "validatorRegisteredEvent",
      "discriminator": [
        68,
        238,
        147,
        217,
        210,
        141,
        46,
        180
      ]
    },
    {
      "name": "validatorRemovedEvent",
      "discriminator": [
        49,
        23,
        179,
        208,
        124,
        3,
        231,
        59
      ]
    },
    {
      "name": "validatorVoteCastEvent",
      "discriminator": [
        241,
        101,
        64,
        163,
        26,
        185,
        154,
        33
      ]
    },
    {
      "name": "validatorVoteExecutedEvent",
      "discriminator": [
        42,
        193,
        150,
        227,
        217,
        85,
        224,
        208
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "customError",
      "msg": "Custom error message"
    },
    {
      "code": 6001,
      "name": "insufficientFunds",
      "msg": "The requested withdrawal amount exceeds the trust express balance."
    },
    {
      "code": 6002,
      "name": "invalidWithdrawAmount",
      "msg": "The withdrawal amount is invalid."
    },
    {
      "code": 6003,
      "name": "invalidAmount",
      "msg": "Invalid amount specified."
    },
    {
      "code": 6004,
      "name": "invalidPrice",
      "msg": "Invalid price specified."
    },
    {
      "code": 6005,
      "name": "invalidCurrency",
      "msg": "Currency code must be exactly 3 characters."
    },
    {
      "code": 6006,
      "name": "paymentInstructionsTooLong",
      "msg": "Payment instructions must be 100 characters or less."
    },
    {
      "code": 6007,
      "name": "activeReservationsExist",
      "msg": "There is an active reservation."
    },
    {
      "code": 6008,
      "name": "missingMakerAta",
      "msg": "Maker's associated token account is missing."
    },
    {
      "code": 6009,
      "name": "cannotReduceBelowReserved",
      "msg": "The reservation amount is invalid."
    },
    {
      "code": 6010,
      "name": "insufficientTokens",
      "msg": "Insufficient tokens available in the trust express."
    },
    {
      "code": 6011,
      "name": "calculationError",
      "msg": "Calculation error occurred."
    },
    {
      "code": 6012,
      "name": "invalidReservationIndex",
      "msg": "Invalid reservation index."
    },
    {
      "code": 6013,
      "name": "invalidMaker",
      "msg": "Invalid maker."
    },
    {
      "code": 6014,
      "name": "unauthorized",
      "msg": "You are not authorized to perform this action."
    },
    {
      "code": 6015,
      "name": "reservationNotPending",
      "msg": "Reservation is not in pending status."
    },
    {
      "code": 6016,
      "name": "invalidMint",
      "msg": "Mint is not invalid."
    },
    {
      "code": 6017,
      "name": "arithmeticOverflow",
      "msg": "Arithemetic overflow."
    },
    {
      "code": 6018,
      "name": "invalidTaker",
      "msg": "Invalid taker for this reservation."
    },
    {
      "code": 6019,
      "name": "invalidFeeDestination",
      "msg": "Invalid fee destination for this reservation."
    },
    {
      "code": 6020,
      "name": "invalidProgramId",
      "msg": "Invalid program ID ."
    },
    {
      "code": 6021,
      "name": "invalidComment",
      "msg": "Invalid comment."
    },
    {
      "code": 6022,
      "name": "invalidResolution",
      "msg": "Invalid resolution status."
    },
    {
      "code": 6023,
      "name": "pendingReservationsExist",
      "msg": "Cannot withdraw funds with pending reservations."
    },
    {
      "code": 6024,
      "name": "cannotDisputeCompletedTransaction",
      "msg": "Cannot dispute a completed or cancelled transaction"
    },
    {
      "code": 6025,
      "name": "unauthorizedDisputer",
      "msg": "Only the maker or taker can dispute a transaction"
    },
    {
      "code": 6026,
      "name": "unauthorizedResolver",
      "msg": "Only an authorized resolver can resolve a dispute"
    },
    {
      "code": 6027,
      "name": "notDisputed",
      "msg": "Transaction is not in disputed status"
    },
    {
      "code": 6028,
      "name": "invalidPaymentInstructions",
      "msg": "No payment instructions provided"
    },
    {
      "code": 6029,
      "name": "tooManyReservations",
      "msg": "Too many active reservations for this trust express."
    },
    {
      "code": 6030,
      "name": "invalidTrustExpressType",
      "msg": "Invalid trust express type"
    },
    {
      "code": 6031,
      "name": "paymentNotSent",
      "msg": "Payment not sent"
    },
    {
      "code": 6032,
      "name": "activeTokenDepositsExist",
      "msg": "There is an active token deposit"
    },
    {
      "code": 6033,
      "name": "noUnreservedTokens",
      "msg": "All buyer orders are filled"
    },
    {
      "code": 6034,
      "name": "reservationNotFound",
      "msg": "Reservation not found for the given taker and payout reference"
    },
    {
      "code": 6035,
      "name": "reservationAlreadyProcessed",
      "msg": "Reservation has already been processed and cannot be modified"
    },
    {
      "code": 6036,
      "name": "missingFeeDestinationAta",
      "msg": "Fee destination ATA is required when fee amount is greater than zero"
    },
    {
      "code": 6037,
      "name": "missingTakerAtaForRefund",
      "msg": "Taker ATA is required for refunds when payout fails"
    },
    {
      "code": 6038,
      "name": "invalidMakerAtaAuthority",
      "msg": "The provided maker ATA does not belong to the maker"
    },
    {
      "code": 6039,
      "name": "invalidCredentialId",
      "msg": "Invalid Flutterwave credential ID: must be between 1 and 64 characters"
    },
    {
      "code": 6040,
      "name": "reservationLimitReached",
      "msg": "Limit reached, use another order or wait"
    },
    {
      "code": 6041,
      "name": "invalidEscrowType",
      "msg": "Invalide Escrow Type"
    },
    {
      "code": 6042,
      "name": "invalidTakerAtaAuthority",
      "msg": "Invalide Taker Authority"
    },
    {
      "code": 6043,
      "name": "missingTakerAta",
      "msg": "Missing Taker ATA"
    },
    {
      "code": 6044,
      "name": "invalidPaymentMode",
      "msg": "Invalid Payment Mode"
    },
    {
      "code": 6045,
      "name": "insufficientAmount",
      "msg": "Insufficient Amount"
    },
    {
      "code": 6046,
      "name": "invalidPayoutReference",
      "msg": "Invalid Payout Reference"
    },
    {
      "code": 6047,
      "name": "buyOrdersPaused",
      "msg": "Buy orders and reservations are currently paused by admin"
    },
    {
      "code": 6048,
      "name": "sellOrdersPaused",
      "msg": "Sell orders and reservations are currently paused by admin"
    },
    {
      "code": 6049,
      "name": "invalidFeePercentage",
      "msg": "Invalid fee percentage: must be between 0 and 1000 basis points (0-10%)"
    },
    {
      "code": 6050,
      "name": "unauthorizedValidator",
      "msg": "Signer is not a registered validator"
    },
    {
      "code": 6051,
      "name": "alreadyVoted",
      "msg": "This validator has already cast a vote for this reservation"
    },
    {
      "code": 6052,
      "name": "voteAlreadyExecuted",
      "msg": "Vote has already been executed"
    },
    {
      "code": 6053,
      "name": "voteExpired",
      "msg": "Vote window has expired — use finalize_expired_vote"
    },
    {
      "code": 6054,
      "name": "voteNotYetExpired",
      "msg": "Vote has not yet expired"
    },
    {
      "code": 6055,
      "name": "validatorSlotsFull",
      "msg": "All 5 validator slots are occupied"
    },
    {
      "code": 6056,
      "name": "validatorNotFound",
      "msg": "Validator pubkey not found in registry"
    },
    {
      "code": 6057,
      "name": "validatorAlreadyRegistered",
      "msg": "Validator is already registered"
    },
    {
      "code": 6058,
      "name": "voteSlotsFull",
      "msg": "All vote slots are occupied (max 5 voters)"
    },
    {
      "code": 6059,
      "name": "invalidVoteThreshold",
      "msg": "Required votes must be between 1 and 5"
    },
    {
      "code": 6060,
      "name": "thresholdExceedsValidators",
      "msg": "Threshold cannot exceed the number of registered validators"
    },
    {
      "code": 6061,
      "name": "invalidPoolAuthority",
      "msg": "Invalid Pool Authority"
    },
    {
      "code": 6062,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6063,
      "name": "insufficientPoolBalance",
      "msg": "Insufficient pool balance"
    },
    {
      "code": 6064,
      "name": "invalidReferenceHash",
      "msg": "Reference hash does not match keccak256(payout_reference)"
    },
    {
      "code": 6065,
      "name": "activeVotesInProgress",
      "msg": "Cannot remove validator while votes are in progress"
    },
    {
      "code": 6066,
      "name": "voteNotYetExecuted",
      "msg": "Vote has not yet been executed"
    }
  ],
  "types": [
    {
      "name": "buyOrdersPausedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "expressBuyOrderCancelledEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "originalAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "expressBuyOrderCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "pricePerToken",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          },
          {
            "name": "paymentInstructions",
            "type": "string"
          },
          {
            "name": "flutterwaveCredentialId",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "expressBuyOrderReducedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "originalAmount",
            "type": "u64"
          },
          {
            "name": "newAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "expressCloseFailedEvent",
      "docs": [
        "Emitted when an attempted close of a trust express fails."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "remainingAmount",
            "type": "u64"
          },
          {
            "name": "errorCode",
            "type": "u32"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "reason",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "expressClosedEvent",
      "docs": [
        "Emitted when express_withdraw fully closes the trust express account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "remainingAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "expressPartialWithdrawalEvent",
      "docs": [
        "Emitted when express_withdraw is a partial withdrawal (account stays open)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "withdrawalAmount",
            "type": "u64"
          },
          {
            "name": "remainingAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "expressPriceUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "oldPrice",
            "type": "u64"
          },
          {
            "name": "newPrice",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "expressSellOrderCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "pricePerToken",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          },
          {
            "name": "paymentInstructions",
            "type": "string"
          },
          {
            "name": "flutterwaveCredentialId",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "feeDestinationUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "oldFeeDestination",
            "type": "pubkey"
          },
          {
            "name": "newFeeDestination",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "feePercentageUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "oldFeePercentage",
            "type": "u16"
          },
          {
            "name": "newFeePercentage",
            "type": "u16"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "globalState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "totalTrustExpressCreated",
            "type": "u64"
          },
          {
            "name": "totalTrustExpressClosed",
            "type": "u64"
          },
          {
            "name": "totalConfirmations",
            "type": "u64"
          },
          {
            "name": "feePercentage",
            "type": "u16"
          },
          {
            "name": "feeDestination",
            "type": "pubkey"
          },
          {
            "name": "totalFeesCollected",
            "type": "u64"
          },
          {
            "name": "totalDisputes",
            "type": "u64"
          },
          {
            "name": "totalVolume",
            "type": "u64"
          },
          {
            "name": "highWatermarkVolume",
            "type": "u64"
          },
          {
            "name": "lastVolumeUpdate",
            "type": "i64"
          },
          {
            "name": "buyOrdersPaused",
            "type": "bool"
          },
          {
            "name": "sellOrdersPaused",
            "type": "bool"
          },
          {
            "name": "validators",
            "docs": [
              "Registered validator pubkeys — empty slots hold Pubkey::default()"
            ],
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "validatorCount",
            "docs": [
              "How many non-default slots are currently filled"
            ],
            "type": "u8"
          },
          {
            "name": "requiredVotes",
            "docs": [
              "Minimum approve votes required to execute a payout (default: 3)"
            ],
            "type": "u8"
          },
          {
            "name": "validatorFeePoolAuthority",
            "docs": [
              "The dedicated PDA that has authority over the validator fee pool ATAs.",
              "Derived as: seeds = [b\"validator-fee-pool-authority\"]",
              "Stored here for reference and verification in the claim instruction."
            ],
            "type": "pubkey"
          },
          {
            "name": "activeVoteCount",
            "docs": [
              "Number of ValidatorVote PDAs that have been created but not yet executed",
              "or expired. Incremented on first vote for a new reference, decremented",
              "on execution (submit_buy/sell_vote) and on expiry (finalize_expired_vote).",
              "Used by remove_validator to block removal while votes are in flight."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "instantPaymentPayoutQueuedEvent",
      "docs": [
        "Emitted when a fiat payout is queued for processing."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fiatAmount",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          },
          {
            "name": "payoutReference",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "instantPaymentPayoutResultEvent",
      "docs": [
        "Emitted by confirm_payout with the final success/failure result."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fiatAmount",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          },
          {
            "name": "payoutReference",
            "type": "string"
          },
          {
            "name": "success",
            "type": "bool"
          },
          {
            "name": "message",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "instantPaymentReservedEvent",
      "docs": [
        "Emitted by instant_reserve when a taker locks tokens into a buy-order escrow."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fiatAmount",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          },
          {
            "name": "payoutDetails",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "payoutReference",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "instantSellPaymentResultEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fiatAmount",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          },
          {
            "name": "payoutReference",
            "type": "string"
          },
          {
            "name": "success",
            "type": "bool"
          },
          {
            "name": "message",
            "type": "string"
          },
          {
            "name": "feeAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "instantSellReservationCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fiatAmount",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          },
          {
            "name": "paymentMode",
            "type": "u8"
          },
          {
            "name": "payoutReference",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "reservedAmount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fiatAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "sellerInstructions",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "disputeReason",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "disputeId",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "payoutDetails",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "payoutReference",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "paymentMode",
            "docs": [
              "0 = payment link, 1 = direct transfer with API monitoring"
            ],
            "type": "u8"
          },
          {
            "name": "paymentLink",
            "docs": [
              "Flutterwave payment link if payment_mode == 0"
            ],
            "type": {
              "option": "string"
            }
          },
          {
            "name": "transactionReference",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "sellOrdersPausedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "trustExpress",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seed",
            "type": "u64"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "currency",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "escrowType",
            "type": "u8"
          },
          {
            "name": "feePercentage",
            "type": "u16"
          },
          {
            "name": "feeDestination",
            "type": "pubkey"
          },
          {
            "name": "reservedFee",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "pricePerToken",
            "type": "u64"
          },
          {
            "name": "paymentInstructions",
            "type": "string"
          },
          {
            "name": "reservedAmounts",
            "type": {
              "vec": {
                "defined": {
                  "name": "reservedAmount"
                }
              }
            }
          },
          {
            "name": "flutterwaveCredentialId",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "trustExpressNearlyEmptyEvent",
      "docs": [
        "Emitted when a trust express balance drops low relative to active reservations."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "remainingAmount",
            "type": "u64"
          },
          {
            "name": "activeReservations",
            "type": "u32"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "validatorEarnings",
      "docs": [
        "Tracks accumulated fee earnings for a single validator on a single token mint.",
        "Created lazily on the first vote execution where this validator earns fees",
        "for a given mint — the signing validator pays for initialization.",
        "",
        "PDA seeds: [b\"validator-earnings\", validator_pubkey, mint_pubkey]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validator",
            "docs": [
              "The validator this account belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "The token mint these earnings are denominated in"
            ],
            "type": "pubkey"
          },
          {
            "name": "accumulatedAmount",
            "docs": [
              "Accumulated fees owed to this validator, not yet claimed"
            ],
            "type": "u64"
          },
          {
            "name": "totalEarned",
            "docs": [
              "Total lifetime earnings for this validator on this mint (never decrements)"
            ],
            "type": "u64"
          },
          {
            "name": "totalCredits",
            "docs": [
              "Total number of vote executions this validator has been credited for"
            ],
            "type": "u64"
          },
          {
            "name": "lastCreditedAt",
            "docs": [
              "Unix timestamp of the last credit"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "Bump for this PDA"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "validatorFeeClaimedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "validatorRegisteredEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "validatorRemovedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "validatorVote",
      "docs": [
        "Tracks the 3-of-5 validator votes for a single reservation payout.",
        "Created by the first validator who votes; filled in by subsequent ones.",
        "Once `executed` is true the account can be closed by anyone."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "docs": [
              "The TrustExpress PDA this vote is for"
            ],
            "type": "pubkey"
          },
          {
            "name": "taker",
            "docs": [
              "The taker (seller/buyer) whose reservation is being settled"
            ],
            "type": "pubkey"
          },
          {
            "name": "referenceHash",
            "docs": [
              "Keccak hash of payout_reference — used as PDA seed (always 32 bytes)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "votesFor",
            "docs": [
              "Number of approve votes received so far"
            ],
            "type": "u8"
          },
          {
            "name": "votesAgainst",
            "docs": [
              "Number of reject votes received so far"
            ],
            "type": "u8"
          },
          {
            "name": "voters",
            "docs": [
              "Which validators have already voted (prevents double-voting)"
            ],
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "voteResults",
            "docs": [
              "What each voter decided (parallel array to `voters`)"
            ],
            "type": {
              "array": [
                "bool",
                5
              ]
            }
          },
          {
            "name": "executed",
            "docs": [
              "True once the threshold was reached and tokens were moved"
            ],
            "type": "bool"
          },
          {
            "name": "createdAt",
            "docs": [
              "Unix timestamp when this vote account was created"
            ],
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "docs": [
              "Unix timestamp after which the vote fails and a refund is triggered"
            ],
            "type": "i64"
          },
          {
            "name": "isBuyOrder",
            "docs": [
              "Whether this is a buy-side (true) or sell-side (false) confirmation"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "bump for this PDA"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "validatorVoteCastEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "validator",
            "type": "pubkey"
          },
          {
            "name": "payoutReference",
            "type": "string"
          },
          {
            "name": "vote",
            "type": "bool"
          },
          {
            "name": "votesFor",
            "type": "u8"
          },
          {
            "name": "votesAgainst",
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "validatorVoteExecutedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustExpress",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "payoutReference",
            "type": "string"
          },
          {
            "name": "success",
            "type": "bool"
          },
          {
            "name": "message",
            "type": "string"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fiatAmount",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "seed",
      "type": "string",
      "value": "\"anchor\""
    }
  ]
};
