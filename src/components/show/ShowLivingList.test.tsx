import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import ShowLivingList from "./ShowLivingList"
import type { LivingShowActor } from "@/types"

// Mock the API
vi.mock("@/services/api", () => ({
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockActor: LivingShowActor = {
  id: 100,
  name: "Test Actor",
  character: "Test Character",
  profile_path: "/profile.jpg",
  birthday: "1960-01-15",
  age: 64,
  totalEpisodes: 5,
  episodes: [
    { seasonNumber: 1, episodeNumber: 1, episodeName: "Pilot", character: "Test Character" },
    {
      seasonNumber: 1,
      episodeNumber: 2,
      episodeName: "Second Episode",
      character: "Test Character",
    },
  ],
}

const mockActorNoPhoto: LivingShowActor = {
  ...mockActor,
  id: 101,
  name: "No Photo Actor",
  profile_path: null,
}

const mockActorNoAge: LivingShowActor = {
  ...mockActor,
  id: 102,
  name: "Unknown Age Actor",
  age: null,
}

const mockActorManyEpisodes: LivingShowActor = {
  ...mockActor,
  id: 103,
  name: "Many Episodes Actor",
  totalEpisodes: 25,
  episodes: Array.from({ length: 25 }, (_, i) => ({
    seasonNumber: Math.floor(i / 10) + 1,
    episodeNumber: (i % 10) + 1,
    episodeName: `Episode ${i + 1}`,
    character: "Test Character",
  })),
}

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  )
}

describe("ShowLivingList", () => {
  it("renders empty state when no actors", () => {
    renderWithRouter(<ShowLivingList actors={[]} />)

    expect(screen.getByTestId("no-living-message")).toBeInTheDocument()
  })

  it("renders list title and cards when actors present", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} />)

    expect(screen.getByTestId("show-living-list")).toBeInTheDocument()
    expect(screen.getByTestId("living-list-title")).toHaveTextContent("Living Cast Members")
    expect(screen.getByTestId("living-cards")).toBeInTheDocument()
    expect(screen.getByTestId("living-card")).toBeInTheDocument()
  })

  it("renders multiple actor cards", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor, mockActorNoPhoto]} />)

    const cards = screen.getAllByTestId("living-card")
    expect(cards).toHaveLength(2)
  })

  it("renders actor photo when available", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} />)

    const photo = screen.getByTestId("living-actor-photo")
    expect(photo).toBeInTheDocument()
    expect(photo).toHaveAttribute("src", "https://image.tmdb.org/profile.jpg")
    expect(photo).toHaveAttribute("alt", "Test Actor")
  })

  it("renders placeholder when no photo", () => {
    renderWithRouter(<ShowLivingList actors={[mockActorNoPhoto]} />)

    expect(screen.getByTestId("living-actor-photo-placeholder")).toBeInTheDocument()
    expect(screen.queryByTestId("living-actor-photo")).not.toBeInTheDocument()
  })

  it("renders actor name as link", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} />)

    const nameLink = screen.getByTestId("living-actor-name").querySelector("a")
    expect(nameLink).toHaveTextContent("Test Actor")
    expect(nameLink).toHaveAttribute("href", "/actor/test-actor-100")
  })

  it("renders character name", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} />)

    expect(screen.getByTestId("living-actor-character")).toHaveTextContent("as Test Character")
  })

  it("renders actor age when available", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} />)

    expect(screen.getByTestId("living-actor-age")).toHaveTextContent("Age 64")
  })

  it("hides age when not available", () => {
    renderWithRouter(<ShowLivingList actors={[mockActorNoAge]} />)

    expect(screen.queryByTestId("living-actor-age")).not.toBeInTheDocument()
  })

  it("renders episode info", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} />)

    expect(screen.getByTestId("living-actor-episodes")).toBeInTheDocument()
  })

  it("shows episode count for actors with no episode data", () => {
    const actorNoEpisodeData: LivingShowActor = {
      ...mockActor,
      totalEpisodes: 10,
      episodes: [],
    }
    renderWithRouter(<ShowLivingList actors={[actorNoEpisodeData]} />)

    expect(screen.getByTestId("living-actor-episodes")).toHaveTextContent("10 episodes")
  })

  it("shows single episode format for one episode", () => {
    const singleEpisodeActor: LivingShowActor = {
      ...mockActor,
      totalEpisodes: 1,
      episodes: [{ seasonNumber: 2, episodeNumber: 5, episodeName: "The One", character: "Guest" }],
    }
    renderWithRouter(<ShowLivingList actors={[singleEpisodeActor]} />)

    expect(screen.getByTestId("living-actor-episodes")).toHaveTextContent('S2E5: "The One"')
  })

  it("expands to show episode list when button clicked", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} />)

    const expandButton = screen.getByRole("button", { name: /Show details for Test Actor/i })
    fireEvent.click(expandButton)

    // Check for expanded content - episode list items should appear
    expect(screen.getByText(/S1E1:/)).toBeInTheDocument()
  })

  it("collapses episode list when button clicked again", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} />)

    const expandButton = screen.getByRole("button", { name: /Show details/i })
    fireEvent.click(expandButton)
    expect(screen.getByText(/S1E1:/)).toBeInTheDocument()

    const collapseButton = screen.getByRole("button", { name: /Collapse details/i })
    fireEvent.click(collapseButton)
    expect(screen.queryByText(/S1E1:/)).not.toBeInTheDocument()
  })

  it("truncates episode list at 20 and shows count", () => {
    renderWithRouter(<ShowLivingList actors={[mockActorManyEpisodes]} />)

    fireEvent.click(screen.getByRole("button", { name: /Show details/i }))

    expect(screen.getByText(/\.\.\.and 5 more episodes/)).toBeInTheDocument()
  })

  it("creates episode links when showId and showName provided", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} showId={1400} showName="Seinfeld" />)

    const episodeLink = screen.getByText('"Pilot"')
    expect(episodeLink.tagName).toBe("A")
    expect(episodeLink).toHaveAttribute("href", "/episode/seinfeld-s1e1-pilot-1400")
  })

  it("shows episode names as text when showId/showName not provided", () => {
    renderWithRouter(<ShowLivingList actors={[mockActor]} />)

    // Episode names should be text, not links
    const episodeText = screen.getByTestId("living-actor-episodes")
    expect(episodeText.querySelector("a")).toBeNull()
  })

  it("hides expand button when actor has no episodes", () => {
    const actorNoEpisodes: LivingShowActor = {
      ...mockActor,
      totalEpisodes: 10,
      episodes: [],
    }
    renderWithRouter(<ShowLivingList actors={[actorNoEpisodes]} />)

    expect(screen.queryByRole("button", { name: /Show details/i })).not.toBeInTheDocument()
  })
})
