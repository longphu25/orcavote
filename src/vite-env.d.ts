/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

declare module '@mysten/dapp-kit/dist/index.css'
