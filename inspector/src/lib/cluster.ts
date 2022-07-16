import { web3 } from "@project-serum/anchor";

export enum Cluster {
  MAINNET_BETA = "mainnet-beta",
  DEVNET = "devnet",
  TESTNET = "testnet",
  LOCALNET = "localnet",
}

export function parseCluster(clusterStr?: string): Cluster {
  if (!clusterStr) {
    return Cluster.MAINNET_BETA;
  }

  switch (clusterStr) {
    case Cluster.MAINNET_BETA:
      return Cluster.MAINNET_BETA;
    case Cluster.DEVNET:
      return Cluster.DEVNET;
    case Cluster.TESTNET:
      return Cluster.TESTNET;
    case Cluster.LOCALNET:
      return Cluster.LOCALNET;
  }
  return Cluster.MAINNET_BETA;
}

export function clusterToWeb3Cluster(cluster: Cluster): web3.Cluster | URL {
  switch (cluster) {
    case Cluster.MAINNET_BETA:
      return "mainnet-beta";
    case Cluster.DEVNET:
      return "devnet";
    case Cluster.TESTNET:
      return "testnet";
    case Cluster.LOCALNET:
      return new URL("http://localhost:8899");
  }
  return "mainnet-beta";
}
