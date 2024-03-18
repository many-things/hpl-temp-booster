# Hyperlane Booster (Temp)

## Features
* Sync
    * Fetch & load dispatch event
    * Merge checkpoints with dispatch event
* Flush
    * L1 -> L2 messaging
    * L2 -> L1 messaging

## Limit
* This is temporary project to process massive traffic of betatest application
* Must inject with local checkpoint environment
* Checkpoints should be structured like this
  ```
  ├── data
  │   ├── relayer
  │   │   ├── db
  │   ├── validator
  │   │   ├── sepolia
  │   │   │   └── checkpoint
  │   │   ├── arbitrumsepolia
  │   │   │   └── checkpoint
  │   │   ├── optimismsepolia
  │   │   │   └── checkpoint
  │   │   └── polygonzkevmcardona
  │   │       └── checkpoint
  ```

## Todos
* Sync remote checkpoints (query VA -> fetch)
* Gas condition
* Use remote database to store deposit event & checkpoint
