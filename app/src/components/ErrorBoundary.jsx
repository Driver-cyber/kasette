import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Cassette error boundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-walnut px-8 text-center gap-5">
          <p className="font-display italic text-amber text-4xl">cassette</p>
          <p className="text-wheat font-semibold text-[17px]">Something went wrong</p>
          <p className="text-rust text-sm leading-relaxed max-w-[260px]">
            An unexpected error occurred. Tap below to reload the app.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-8 py-3 rounded-2xl font-sans font-bold text-[15px] active:opacity-80"
            style={{ background: '#F2A24A', color: '#2C1A0E' }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
