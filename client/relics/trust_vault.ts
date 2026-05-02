/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trust_vault.json`.
 */
export type TrustVault = {
  "address": "EungWtkwfbapeEkuBrD4fdMNrcey2E1UdFvw8AugWodb",
  "metadata": {
    "name": "trustVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "buyOrderPaymentSent",
      "discriminator": [
        242,
        176,
        200,
        118,
        232,
        229,
        229,
        209
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "seller"
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "trust_vault.maker",
                "account": "trustVault"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
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
          "name": "reservationIndex",
          "type": "u8"
        }
      ]
    },
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
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "trust_vault.maker",
                "account": "trustVault"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
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
      "name": "cancelReservation",
      "discriminator": [
        72,
        162,
        75,
        180,
        116,
        157,
        146,
        172
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "trust_vault.maker",
                "account": "trustVault"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "reservationIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "confirmPayment",
      "discriminator": [
        221,
        23,
        112,
        126,
        29,
        23,
        159,
        223
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true,
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "taker",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "feeDestination",
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "feeDestinationAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeDestination"
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
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustVault"
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
          "name": "reservationIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createBuyOrder",
      "discriminator": [
        182,
        87,
        0,
        160,
        192,
        66,
        151,
        130
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
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
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
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
        }
      ]
    },
    {
      "name": "createSellOrder",
      "discriminator": [
        53,
        52,
        255,
        44,
        191,
        74,
        171,
        225
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
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
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "arg",
                "path": "seed"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustVault"
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
          "name": "feeDestination"
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
        }
      ]
    },
    {
      "name": "disputePayment",
      "discriminator": [
        31,
        193,
        219,
        54,
        33,
        252,
        113,
        100
      ],
      "accounts": [
        {
          "name": "disputer",
          "writable": true,
          "signer": true
        },
        {
          "name": "maker"
        },
        {
          "name": "taker"
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "trust_vault.maker",
                "account": "trustVault"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
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
        }
      ],
      "args": [
        {
          "name": "reservationIndex",
          "type": "u8"
        },
        {
          "name": "disputeReason",
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
          "name": "admin",
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
          "name": "mint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "markPaymentSent",
      "discriminator": [
        250,
        119,
        221,
        215,
        85,
        50,
        166,
        109
      ],
      "accounts": [
        {
          "name": "taker",
          "writable": true,
          "signer": true
        },
        {
          "name": "maker",
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "trust_vault.maker",
                "account": "trustVault"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
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
          "name": "reservationIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "reserveBuyOrder",
      "discriminator": [
        175,
        209,
        34,
        109,
        57,
        60,
        232,
        193
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "buyer",
          "writable": true
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "trust_vault.maker",
                "account": "trustVault"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
              }
            ]
          }
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
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustVault"
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
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "paymentInstructions",
          "type": "string"
        }
      ]
    },
    {
      "name": "reserveTokens",
      "discriminator": [
        16,
        166,
        19,
        209,
        223,
        151,
        170,
        26
      ],
      "accounts": [
        {
          "name": "taker",
          "writable": true,
          "signer": true
        },
        {
          "name": "maker",
          "writable": true,
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustVault"
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
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "disputeReason",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "resolveDisputes",
      "discriminator": [
        138,
        226,
        118,
        243,
        70,
        34,
        144,
        193
      ],
      "accounts": [
        {
          "name": "resolver",
          "docs": [
            "The authority that can resolve disputes (could be program admin or arbitrator)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "maker",
          "writable": true,
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "taker",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustVault"
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
          "name": "feeDestinationAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trust_vault.fee_destination",
                "account": "trustVault"
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
          "name": "reservationIndex",
          "type": "u8"
        },
        {
          "name": "resolution",
          "type": "u8"
        },
        {
          "name": "resolutionReason",
          "type": "string"
        }
      ]
    },
    {
      "name": "sellerConfirmsPayment",
      "discriminator": [
        252,
        114,
        132,
        143,
        72,
        238,
        51,
        57
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "buyer",
          "writable": true
        },
        {
          "name": "mint",
          "docs": [
            "The mint of the token in the vault"
          ]
        },
        {
          "name": "feeDestination",
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "trust_vault.maker",
                "account": "trustVault"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustVault"
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
          "name": "buyerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
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
          "name": "feeDestinationAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeDestination"
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
          "name": "reservationIndex",
          "type": "u8"
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
            "trustVault"
          ]
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
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
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true,
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "trustVault"
          ]
        },
        {
          "name": "trustVault",
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
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "trust_vault.seed",
                "account": "trustVault"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trustVault"
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
      "name": "trustVault",
      "discriminator": [
        48,
        90,
        73,
        80,
        85,
        249,
        121,
        214
      ]
    }
  ],
  "events": [
    {
      "name": "buyOrderCancelledEvent",
      "discriminator": [
        118,
        145,
        69,
        220,
        68,
        112,
        48,
        144
      ]
    },
    {
      "name": "buyOrderCreatedEvent",
      "discriminator": [
        158,
        4,
        42,
        74,
        250,
        125,
        66,
        173
      ]
    },
    {
      "name": "buyOrderReducedEvent",
      "discriminator": [
        250,
        72,
        155,
        121,
        173,
        162,
        112,
        178
      ]
    },
    {
      "name": "buyOrderReservedEvent",
      "discriminator": [
        96,
        226,
        145,
        32,
        118,
        16,
        55,
        64
      ]
    },
    {
      "name": "buyerPaymentSentEvent",
      "discriminator": [
        93,
        112,
        150,
        57,
        70,
        119,
        112,
        207
      ]
    },
    {
      "name": "disputeCreatedEvent",
      "discriminator": [
        89,
        162,
        48,
        158,
        30,
        116,
        145,
        247
      ]
    },
    {
      "name": "disputeResolvedEvent",
      "discriminator": [
        152,
        37,
        98,
        245,
        229,
        39,
        150,
        78
      ]
    },
    {
      "name": "partialWithdrawalEvent",
      "discriminator": [
        145,
        236,
        133,
        111,
        56,
        164,
        255,
        176
      ]
    },
    {
      "name": "paymentConfirmedEvent",
      "discriminator": [
        162,
        217,
        241,
        162,
        243,
        91,
        228,
        186
      ]
    },
    {
      "name": "paymentSentEvent",
      "discriminator": [
        41,
        249,
        146,
        133,
        211,
        92,
        159,
        46
      ]
    },
    {
      "name": "priceUpdatedEvent",
      "discriminator": [
        217,
        171,
        222,
        24,
        64,
        152,
        217,
        36
      ]
    },
    {
      "name": "reservationCancelledEvent",
      "discriminator": [
        202,
        53,
        92,
        233,
        242,
        40,
        92,
        225
      ]
    },
    {
      "name": "sellerConfirmsPaymentEvent",
      "discriminator": [
        9,
        180,
        78,
        60,
        40,
        86,
        128,
        104
      ]
    },
    {
      "name": "tokenReserved",
      "discriminator": [
        11,
        183,
        67,
        38,
        218,
        42,
        142,
        149
      ]
    },
    {
      "name": "trustVaultClosedEvent",
      "discriminator": [
        9,
        42,
        33,
        57,
        62,
        220,
        68,
        211
      ]
    },
    {
      "name": "trustVaultCreatedEvent",
      "discriminator": [
        51,
        31,
        254,
        131,
        70,
        255,
        70,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "calculationError",
      "msg": "Calculation Error occured"
    },
    {
      "code": 6001,
      "name": "invalidCurrency",
      "msg": "Invalid Currency"
    },
    {
      "code": 6002,
      "name": "invalidAmount",
      "msg": "Invalid Amount"
    },
    {
      "code": 6003,
      "name": "invalidPrice",
      "msg": "Invalid Price"
    },
    {
      "code": 6004,
      "name": "paymentInstructionsTooLong",
      "msg": "Payment Instructions Too Long"
    },
    {
      "code": 6005,
      "name": "invalidPaymentInstructions",
      "msg": "Provide a Payment Instructions"
    },
    {
      "code": 6006,
      "name": "insufficientFunds",
      "msg": "Insufficient Funds in Vault"
    },
    {
      "code": 6007,
      "name": "tooManyReservations",
      "msg": "Too Many Reservations"
    },
    {
      "code": 6008,
      "name": "insufficientTokens",
      "msg": "Insufficient Tokens"
    },
    {
      "code": 6009,
      "name": "invalidReservationIndex",
      "msg": "Invalid Reservation Index"
    },
    {
      "code": 6010,
      "name": "reservationNotPending",
      "msg": "No pending reservation"
    },
    {
      "code": 6011,
      "name": "activeReservationsExist",
      "msg": "No active reservation"
    },
    {
      "code": 6012,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6013,
      "name": "invalidTrustVaultType",
      "msg": "Invalid trust vault type"
    },
    {
      "code": 6014,
      "name": "invalidTaker",
      "msg": "You are not the Taker of the reservation"
    },
    {
      "code": 6015,
      "name": "cannotReduceBelowReserved",
      "msg": "Amount cannot be below the reserved"
    },
    {
      "code": 6016,
      "name": "invalidMaker",
      "msg": "Invalided maker"
    },
    {
      "code": 6017,
      "name": "cannotDisputeCompletedTransaction",
      "msg": "cannot complete payment due to dispute"
    },
    {
      "code": 6018,
      "name": "unauthorizedDisputer",
      "msg": "Unauthorized, only maker or seller can raise disputes"
    },
    {
      "code": 6019,
      "name": "unauthorizedResolver",
      "msg": "Unauthorized, you are not an admin and cannot resolve disputes"
    },
    {
      "code": 6020,
      "name": "notDisputed",
      "msg": "Unauthorized, this transaction is not disputed"
    }
  ],
  "types": [
    {
      "name": "buyOrderCancelledEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
      "name": "buyOrderCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
          }
        ]
      }
    },
    {
      "name": "buyOrderReducedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
      "name": "buyOrderReservedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "seller",
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
          }
        ]
      }
    },
    {
      "name": "buyerPaymentSentEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "seller",
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
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "disputeCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
            "name": "reservationIndex",
            "type": "u8"
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
            "name": "disputer",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "disputeId",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "disputeResolvedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
            "name": "reservationIndex",
            "type": "u8"
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
            "name": "feeAmount",
            "type": "u64"
          },
          {
            "name": "transferAmount",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          },
          {
            "name": "resolver",
            "type": "pubkey"
          },
          {
            "name": "resolution",
            "type": "u8"
          },
          {
            "name": "resolutionReason",
            "type": "string"
          },
          {
            "name": "trustVaultType",
            "type": "u8"
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
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "totalTrustVaultsCreated",
            "type": "u64"
          },
          {
            "name": "totalTrustVaultsClosed",
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
            "name": "totalVolume",
            "type": "u64"
          },
          {
            "name": "tokenDecimals",
            "type": "u8"
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
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "totalDisputes",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "partialWithdrawalEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "refundAmount",
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
      "name": "paymentConfirmedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
            "name": "feeAmount",
            "type": "u64"
          },
          {
            "name": "fiatAmount",
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
      "name": "paymentSentEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
            "name": "feeAmount",
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
      "name": "priceUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
      "name": "reservationCancelledEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
            "name": "cancelledBy",
            "type": "pubkey"
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
            "name": "status",
            "type": "u8"
          },
          {
            "name": "sellerInstructions",
            "type": {
              "option": "string"
            }
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
          }
        ]
      }
    },
    {
      "name": "sellerConfirmsPaymentEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "seller",
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
          }
        ]
      }
    },
    {
      "name": "tokenReserved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "maker",
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
          }
        ]
      }
    },
    {
      "name": "trustVault",
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
            "name": "trustVaultType",
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
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "trustVaultClosedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
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
      "name": "trustVaultCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trustVault",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "mintA",
            "type": "pubkey"
          },
          {
            "name": "amount",
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
            "name": "pricePerToken",
            "type": "u64"
          },
          {
            "name": "currency",
            "type": "string"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "seed",
      "type": "string",
      "value": "\"trust_vault\""
    }
  ]
};
