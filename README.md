# Hyperlane Booster (Temp)

## Desc
* Must inject with local checkpoint environment
* Checkpoints should structured like this
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
