import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import ShowDeceasedList from "./ShowDeceasedList"
import type { DeceasedShowActor } from "@/types"

// Mock the API
vi.mock("@/services/api", () => ({
  getProfileUrl: vi.fn((path: string | null) => (path ? `https://image.tmdb.org${path}` : null)),
}))

const mockActor: DeceasedShowActor = {
  id: 100,
  name: "Test Actor",
  character: "Test Character",
  profile_path: "/profile.jpg",
  birthday: "1940-01-15",
  deathday: "2020-06-20",
  ageAtDeath: 80,
  yearsLost: 5,
  causeOfDeath: "Natural causes",
  causeOfDeathDetails: "Passed peacefully",
  wikipediaUrl: "https://en.wikipedia.org/wiki/Test_Actor",
  tmdbUrl: "https://www.themoviedb.org/person/100",
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

const mockActorNoPhoto: DeceasedShowActor = {
  ...mockActor,
  id: 101,
  name: "No Photo Actor",
  profile_path: null,
}

const mockActorManyEpisodes: DeceasedShowActor = {
  ...mockActor,
  id: 102,
  name: "Many Episodes Actor",
  totalEpisodes: 25,
  episodes: Array.from({ length: 25 }, (_, i) => ({
    seasonNumber: Math.floor(i / 10) + 1,
    episodeNumber: (i % 10) + 1,
    episodeName: `Episode ${i + 1}`,
    character: "Test Character",
  })),
}

// Create many actors for pagination testing
const createManyActors = (count: number): DeceasedShowActor[] =>
  Array.from({ length: count }, (_, i) => ({
    ...mockActor,
    id: 200 + i,
    name: `Actor ${i + 1}`,
  }))

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>
  )
}

describe("ShowDeceasedList", () => {
  it("renders empty state when no actors", () => {
    renderWithRouter(<ShowDeceasedList actors={[]} />)

    expect(screen.getByTestId("no-deceased-message")).toBeInTheDocument()
  })

  it("renders list title and cards when actors present", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    expect(screen.getByTestId("show-deceased-list")).toBeInTheDocument()
    expect(screen.getByTestId("deceased-list-title")).toHaveTextContent("Deceased Cast Members")
    expect(screen.getByTestId("deceased-cards")).toBeInTheDocument()
    expect(screen.getByTestId("deceased-card")).toBeInTheDocument()
  })

  it("renders multiple actor cards", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor, mockActorNoPhoto]} />)

    const cards = screen.getAllByTestId("deceased-card")
    expect(cards).toHaveLength(2)
  })

  it("renders actor photo when available", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    const photo = screen.getByTestId("actor-photo")
    expect(photo).toBeInTheDocument()
    expect(photo).toHaveAttribute("src", "https://image.tmdb.org/profile.jpg")
    expect(photo).toHaveAttribute("alt", "Test Actor")
  })

  it("renders placeholder when no photo", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActorNoPhoto]} />)

    expect(screen.getByTestId("actor-photo-placeholder")).toBeInTheDocument()
    expect(screen.queryByTestId("actor-photo")).not.toBeInTheDocument()
  })

  it("renders actor name as link", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    const nameLink = screen.getByTestId("actor-name").querySelector("a")
    expect(nameLink).toHaveTextContent("Test Actor")
    expect(nameLink).toHaveAttribute("href", "/actor/test-actor-100")
  })

  it("renders character name", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    expect(screen.getByTestId("actor-character")).toHaveTextContent("as Test Character")
  })

  it("renders episode info", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    expect(screen.getByTestId("actor-episodes")).toBeInTheDocument()
  })

  it("shows episode count for actors with no episode data", () => {
    const actorNoEpisodeData: DeceasedShowActor = {
      ...mockActor,
      totalEpisodes: 10,
      episodes: [],
    }
    renderWithRouter(<ShowDeceasedList actors={[actorNoEpisodeData]} />)

    expect(screen.getByTestId("actor-episodes")).toHaveTextContent("10 episodes")
  })

  it("shows single episode format for one episode", () => {
    const singleEpisodeActor: DeceasedShowActor = {
      ...mockActor,
      totalEpisodes: 1,
      episodes: [{ seasonNumber: 2, episodeNumber: 5, episodeName: "The One", character: "Guest" }],
    }
    renderWithRouter(<ShowDeceasedList actors={[singleEpisodeActor]} />)

    expect(screen.getByTestId("actor-episodes")).toHaveTextContent('S2E5: "The One"')
  })

  it("expands to show details when button clicked", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    expect(screen.queryByTestId("actor-expanded")).not.toBeInTheDocument()

    const expandButton = screen.getByRole("button", { name: /Show details for Test Actor/i })
    fireEvent.click(expandButton)

    expect(screen.getByTestId("actor-expanded")).toBeInTheDocument()
    expect(screen.getByText("Episode Appearances:")).toBeInTheDocument()
  })

  it("collapses details when button clicked again", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    const expandButton = screen.getByRole("button", { name: /Show details/i })
    fireEvent.click(expandButton)
    expect(screen.getByTestId("actor-expanded")).toBeInTheDocument()

    const collapseButton = screen.getByRole("button", { name: /Collapse details/i })
    fireEvent.click(collapseButton)
    expect(screen.queryByTestId("actor-expanded")).not.toBeInTheDocument()
  })

  it("shows episode list in expanded section", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    fireEvent.click(screen.getByRole("button", { name: /Show details/i }))

    // Check that episode codes appear in expanded list
    expect(screen.getByText(/S1E1:/)).toBeInTheDocument()
    expect(screen.getByText(/S1E2:/)).toBeInTheDocument()
    // Episode names may appear multiple times (summary + expanded list), so use getAllByText
    expect(screen.getAllByText(/"Pilot"/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/"Second Episode"/).length).toBeGreaterThanOrEqual(1)
  })

  it("truncates episode list at 20 and shows count", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActorManyEpisodes]} />)

    fireEvent.click(screen.getByRole("button", { name: /Show details/i }))

    expect(screen.getByText(/\.\.\.and 5 more episodes/)).toBeInTheDocument()
  })

  it("shows TMDB link in expanded section", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    fireEvent.click(screen.getByRole("button", { name: /Show details/i }))

    const tmdbLink = screen.getByText("View on TMDB")
    expect(tmdbLink).toHaveAttribute("href", "https://www.themoviedb.org/person/100")
    expect(tmdbLink).toHaveAttribute("target", "_blank")
  })

  it("shows Wikipedia link when available", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    fireEvent.click(screen.getByRole("button", { name: /Show details/i }))

    const wikiLink = screen.getByText("Wikipedia")
    expect(wikiLink).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Test_Actor")
  })

  it("hides Wikipedia link when not available", () => {
    const actorNoWiki: DeceasedShowActor = { ...mockActor, wikipediaUrl: null }
    renderWithRouter(<ShowDeceasedList actors={[actorNoWiki]} />)

    fireEvent.click(screen.getByRole("button", { name: /Show details/i }))

    expect(screen.queryByText("Wikipedia")).not.toBeInTheDocument()
  })

  it("creates episode links when showId and showName provided", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} showId={1400} showName="Seinfeld" />)

    const episodeLink = screen.getByText('"Pilot"')
    expect(episodeLink.tagName).toBe("A")
    expect(episodeLink).toHaveAttribute("href", "/episode/seinfeld-s1e1-pilot-1400")
  })

  it("shows episode names as text when showId/showName not provided", () => {
    renderWithRouter(<ShowDeceasedList actors={[mockActor]} />)

    // Episode names should be text, not links
    const episodeText = screen.getByTestId("actor-episodes")
    expect(episodeText.querySelector("a")).toBeNull()
  })

  describe("pagination", () => {
    it("shows all actors when count is under page size", () => {
      const actors = createManyActors(10)
      renderWithRouter(<ShowDeceasedList actors={actors} />)

      const cards = screen.getAllByTestId("deceased-card")
      expect(cards).toHaveLength(10)
      expect(screen.queryByTestId("show-more-deceased")).not.toBeInTheDocument()
    })

    it("shows only first 25 actors when list exceeds page size", () => {
      const actors = createManyActors(50)
      renderWithRouter(<ShowDeceasedList actors={actors} />)

      const cards = screen.getAllByTestId("deceased-card")
      expect(cards).toHaveLength(25)
      expect(screen.getByTestId("show-more-deceased")).toBeInTheDocument()
    })

    it("shows remaining count in button text", () => {
      const actors = createManyActors(50)
      renderWithRouter(<ShowDeceasedList actors={actors} />)

      expect(screen.getByTestId("show-more-deceased")).toHaveTextContent("25 remaining")
    })

    it("shows more actors when button is clicked", () => {
      const actors = createManyActors(50)
      renderWithRouter(<ShowDeceasedList actors={actors} />)

      expect(screen.getAllByTestId("deceased-card")).toHaveLength(25)

      fireEvent.click(screen.getByTestId("show-more-deceased"))

      expect(screen.getAllByTestId("deceased-card")).toHaveLength(50)
      expect(screen.queryByTestId("show-more-deceased")).not.toBeInTheDocument()
    })

    it("handles multiple clicks to show all actors", () => {
      const actors = createManyActors(60)
      renderWithRouter(<ShowDeceasedList actors={actors} />)

      expect(screen.getAllByTestId("deceased-card")).toHaveLength(25)
      expect(screen.getByTestId("show-more-deceased")).toHaveTextContent("35 remaining")

      fireEvent.click(screen.getByTestId("show-more-deceased"))

      expect(screen.getAllByTestId("deceased-card")).toHaveLength(50)
      expect(screen.getByTestId("show-more-deceased")).toHaveTextContent("10 remaining")

      fireEvent.click(screen.getByTestId("show-more-deceased"))

      expect(screen.getAllByTestId("deceased-card")).toHaveLength(60)
      expect(screen.queryByTestId("show-more-deceased")).not.toBeInTheDocument()
    })
  })
})
