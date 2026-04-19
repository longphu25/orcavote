import {
  Navbar,
  Hero,
  HowItWorks,
  Features,
  ZKArchitecture,
  VotingFlow,
  UseCases,
  CTA,
  Footer,
} from './components/landing'

export default function App() {
  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <ZKArchitecture />
      <VotingFlow />
      <UseCases />
      <CTA />
      <Footer />
    </div>
  )
}