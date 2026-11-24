// ============================================================================
// content.js - everything a writer or level designer would want to edit:
// the house layout, rooms, objects, info cards, dialogue lines, belt items
// and story beat start points. The engine (engine.js) reads this.
//
// Coordinates are in TILES (16px). x grows right, y grows down.
// ============================================================================

const CONTENT = {};

// ---------------------------------------------------------------------------
// The house: one continuous map. Everything starts as wall, then rooms and
// doorways are carved out as floor.
// ---------------------------------------------------------------------------
CONTENT.map = {
  width: 64,
  height: 43,

  // Rooms: interior floor rectangles. `path` is shown in the HUD.
  // floor: "wood" | "runner" (hallway) | "tile" | "stone" | "books"
  rooms: [
    { id: "bedroom",      path: "/bedroom/",      x: 2,  y: 2,  w: 15, h: 11, floor: "wood" },
    { id: "scratch_room", path: "/scratch_room/", x: 22, y: 6,  w: 9,  h: 7,  floor: "wood" }, // small
    { id: "nest",         path: "/nest/",         x: 40, y: 6,  w: 9,  h: 7,  floor: "straw" }, // small
    { id: "hallway",      path: "/hallway/",      x: 2,  y: 16, w: 33, h: 6,  floor: "runner" }, // ground floor
    { id: "landing",      path: "/landing/",      x: 37, y: 16, w: 23, h: 6,  floor: "runner" }, // upper floor (via the spiral stairs)
    { id: "library",      path: "/library/",      x: 2,  y: 25, w: 14, h: 9,  floor: "books" },
    { id: "bathroom",     path: "/bathroom/",     x: 23, y: 25, w: 12, h: 7, floor: "tile" },
    { id: "attic",        path: "/attic/",        x: 51, y: 5,  w: 9,  h: 8,  floor: "attic" },   // up a flight of stairs from the landing
    { id: "storage_room", path: "/storage_room/", x: 45, y: 25, w: 9,  h: 7,  floor: "wood" },    // optional side room off the landing (skills)
  ],

  // Doorways: openings carved through walls (3 tiles wide so they're easy to walk through).
  doors: [
    { x: 8,  y: 13, w: 3, h: 3 },  // bedroom      <-> hallway
    { x: 25, y: 13, w: 3, h: 3 },  // scratch room <-> hallway
    { x: 43, y: 13, w: 3, h: 3 },  // nest         <-> hallway
    { x: 9,  y: 22, w: 3, h: 3 },  // library      <-> hallway
    { x: 27, y: 22, w: 3, h: 3 },  // bathroom     <-> hallway
    { x: 48, y: 22, w: 3, h: 3 },  // storage room <-> landing
    { x: 54, y: 13, w: 3, h: 3, stairs: true },  // attic stairs (chained shut until the W key opens them)
  ],

  // Spiral staircases between floors: stepping into `zone` plays the stair
  // cutscene and puts you at `to` (tile coords) on the other floor.
  stairs: [
    { zone: { x: 33, y: 16, w: 2, h: 6 }, to: { x: 39, y: 19 }, dir: "right", label: "up" },
    { zone: { x: 37, y: 16, w: 1, h: 6 }, to: { x: 31, y: 19 }, dir: "left", label: "down" },
  ],

  // Where a brand new game starts (tile coords).
  start: { x: 7, y: 6 },
};

// ---------------------------------------------------------------------------
// Objects in the house.
//   sprite: key in SPRITES (assets.js)
//   x, y:   tile position. Floor objects: top-left corner.
//           Wall objects (mount: "wall"): y is the wall-face row they hang on.
//   dx, dy: optional pixel nudge
//   layer:  "floor" = drawn flat under everything (rugs, puddles)
//   solid:  blocks movement. `hit: [x, y, w, h]` (px, relative to sprite) narrows it.
//   solidUnless: flag name; solid until that flag is true (e.g. the cellar door)
//   light:  { r: radius px, color: "warm" | "green" | "violet", y: px offset }
//   card:   info card shown when you walk up to it
//   look:   placeholder lines the bird says when you press Z (milestone 1)
// ---------------------------------------------------------------------------
CONTENT.objects = [
  // ----- Bedroom -----
  { id: "rug", sprite: "rug", x: 2, y: 3, layer: "floor", size: [7, 7], nudge: 0.0 }, // big rug under the bed
  { id: "bed", sprite: "bed", x: 3, y: 2, solid: true, size: [3.4, 4.4], nudge: 0.25, hit: [4, 4, 54, 66], // big four-poster
    card: { title: "Bed", line: "Still warm. How long were you asleep?" },
    look: ["It's your bed. Probably.", "Let's not go back to sleep just yet."] },
  { id: "nightstand", sprite: "nightstand", x: 7, y: 2, solid: true },
  { id: "nightstand_l", sprite: "nightstand", x: 2, y: 2, solid: true },
  { id: "bed_candle_l", sprite: "candle", x: 2, y: 2, dx: 4, dy: -6, light: { r: 30, color: "green" } },
  { id: "bed_candle", sprite: "candle", x: 7, y: 2, dx: 4, dy: -6, light: { r: 34, color: "green" } },
  { id: "window", sprite: "window", x: 10, y: 1, mount: "wall",
    card: { title: "Window", line: "A purple moon. Locked tight." },
    look: ["The moon is watching. Politely."] },
  { id: "fireplace", sprite: "fireplace", x: 13, y: 2, solid: true, light: { r: 46, color: "green", y: 4 } }, // decor; the portrait above it is the clue
  { id: "portrait", sprite: "portrait", x: 14, y: 1, dx: -4, mount: "wall", reach: 30, light: { r: 26, color: "green", y: -8 },
    card: { title: "Old photo", line: "Above the green fire, a group of friends faintly glowing." },
    look: ["Four little faces. They look happy.", "(Reading it comes in the next milestone.)"] },
  { id: "bedroom_candle", sprite: "candle", x: 16, y: 12, dx: 4, light: { r: 36, color: "green" } },
  // gothic extras
  { id: "armour", sprite: "armour", x: 2, y: 8, solid: true, turn: Math.PI / 2, // faces into the room
    card: { title: "Suit of armor", line: "Empty. You hope." },
    look: ["The visor creaks a little when you get close.", "Probably the draught."] },
  { id: "stag_skeleton", sprite: "skeleton", x: 15, y: 9, solid: true, turn: -Math.PI / 2, size: [2, 1], nudge: 0.55,
    card: { title: "Stag skeleton", line: "Someone's idea of decor." },
    look: ["Every bone wired in place. Its empty eyes follow you.", "They don't. Probably."] },
  { id: "banner_lib", sprite: "banner", x: 7, y: 24, dx: 6, mount: "wall" },
  { id: "candelabra_1", sprite: "candelabra", x: 9, y: 2, solid: true, light: { r: 34, color: "green" } },
  { id: "candelabra_2", sprite: "candelabra", x: 2, y: 11, solid: true, light: { r: 30, color: "green" } },

  // ----- Hallway -----
  { id: "painting_1", reach: 26, sprite: "painting_1", x: 5, y: 15, dx: 4, mount: "wall",
    card: { title: "Painting", line: "A small house on a hill." },
    look: ["One window is lit. Somebody's home."] },
  { id: "painting_2", sprite: "painting_2", hidden: true, x: 15, y: 15, dx: -4, mount: "wall",
    card: { title: "Painting", line: "A ghost, smiling a bit too wide." },
    look: ["I think it winked at me."] },
  { id: "painting_3", sprite: "painting_3", hidden: true, x: 22, y: 15, dx: 8, mount: "wall",
    card: { title: "Painting", line: "A lantern, burning low." },
    look: ["Same lantern as yours. Spooky."] },
  { id: "plaque", sprite: "plaque", hidden: true, x: 28, y: 15, dx: 2, mount: "wall", dy: -2,
    card: { title: "Brass plaque", line: "A riddle is engraved here." },
    look: ["Words, worn smooth. A riddle, maybe."] },
  { id: "front_door", sprite: "front_door", x: 17, y: 15, mount: "wall",
    card: { title: "Front door", line: "Locked. It wants a password." },
    look: ["Eleven little letter slots.", "We need the password to get out."] },
  { id: "cellar_door", sprite: "cellar_door", x: 54, y: 15, solid: true, solidUnless: "cellarOpen",   // the chains on the attic door
    light: { r: 30, color: "green", y: 4 },
    card: { title: "Attic door", line: "Chained shut from this side. Is that... knocking?" } },
  { id: "sconce_1", sprite: "sconce", hidden: true, x: 10, y: 15, dx: 0, mount: "wall", dx: 4, dy: -4, light: { r: 44, color: "green", y: -8 } },

  // ----- Scratch room -----
  { id: "chalkboard", sprite: "chalkboard", x: 25, y: 5, mount: "wall", dx: -8,
    card: { title: "Chalkboard", line: "Scratch space for this thread." },
    look: ["A big, clean chalkboard. This is my scratch space.",
      "When a puzzle needs working out, like jotting down letters or crossing off wrong guesses, I'll write it here instead of trying to hold it all in my head.",
      "But it only lasts for this thread. Start a new one and the board gets wiped clean.",
      "Anything worth keeping for good, I save to my long-term memory."] },
  { id: "desk", sprite: "desk", x: 23, y: 9, solid: true, hit: [0, 0, 32, 14],
    card: { title: "Desk", line: "Chalk dust and a stubby pencil. Nothing else in here... right?" } },
  { id: "loose_brick", sprite: "loose_brick", hidden: true, x: 23, y: 5, dx: 4, mount: "wall", lift: 0.35,
    card: { title: "Loose brick", line: "It wobbles when you touch it." } },
  { id: "w_key", sprite: "w_key", hidden: true, x: 23, y: 5, dx: 4, mount: "wall", lift: 0.35 },
  { id: "scratch_candle_1", sprite: "candle", x: 22, y: 6, dx: 4, light: { r: 38, color: "green" } },
  { id: "scratch_candle_2", sprite: "candle", x: 30, y: 6, dx: 4, light: { r: 38, color: "green" } },
  { id: "scratch_candle_3", sprite: "candle", x: 29, y: 11, dx: 4, light: { r: 34, color: "green" } },

  // ----- Nest room -----
  { id: "nest", sprite: "nest", x: 42, y: 8, solid: true, hit: [2, 12, 60, 26],
    card: { title: "The nest", line: "Polly's long-term memory: a store that outlasts every thread." },
    look: ["I set up my nest here while you were asleep! Isn't it cozy?"] },
  { id: "pedestal", sprite: "pedestal", hidden: true, x: 46, y: 9, solid: true, hit: [2, 8, 12, 16] },
  { id: "uv_light", sprite: "uv_light", hidden: true, x: 46, y: 9, dx: 2, dy: -2, light: { r: 22, color: "violet" },
    card: { title: "UV light", line: "Shows what eyes can't see." },
    look: ["A little purple flashlight. Its light makes hidden things glow.", "Let's remember it's here. Something in this house is bound to need it."] },
  { id: "nest_candle", sprite: "candle", x: 40, y: 6, dx: 4, light: { r: 38, color: "green" } },
  { id: "nest_candle_2", sprite: "candle", x: 48, y: 6, dx: 4, light: { r: 38, color: "green" } },

  // ----- Storage room (optional; skills). Everything here is `extra: true` so it never reshuffles the rest of the house. -----
  { id: "storage_candle_2", extra: true, sprite: "candle", x: 53, y: 25, dx: 4, light: { r: 38, color: "green" } },
  { id: "storage_set", extra: true, sprite: "storage_set", x: 45, y: 25 },                                        // dust on the floor
  { id: "web_store_l", extra: true, sprite: "cobweb", x: 45, y: 24, mount: "wall", cx: 45.0, side: "right" },
  { id: "web_store_r", extra: true, sprite: "cobweb", x: 53, y: 24, mount: "wall", cx: 54.0, side: "left" },
  { id: "scroll_rack", extra: true, sprite: "scroll_rack", x: 44, y: 28, side: "west", width: 5, solid: true,     // the whole left wall
    card: { title: "Skill scrolls", line: "A wall of rolled-up scrolls, each with a name tag." } },
  { id: "vial_shelf", extra: true, sprite: "vial_shelf", x: 46, y: 24, mount: "wall", width: 2.3, light: { r: 38, color: "green" }, lightDx: -1.02, lightY: 2.4,   // the light sits on the candle at the left end of the top shelf
    card: { title: "Vial rack", line: "Three identical vials on a little rack." } },
  { id: "storage_shelves", extra: true, sprite: "storage_shelves", x: 54, y: 28, side: "east", width: 4.4, solid: true,
    card: { title: "Storage shelves", line: "Rows of jars, vials and small boxes." },
    look: ["More vials and boxes, floor to ceiling.", "Nobody has dusted in here for a very long time."] },
  { id: "spooky_basket", extra: true, sprite: "spooky_basket", x: 45, y: 31, size: [1, 1], solid: true,
    card: { title: "Basket", line: "A wicker basket of odds and ends." },
    look: ["A skull, some bones, a crystal, a feather...", "It's either a lost-and-found or somebody's shopping."] },
  { id: "storage_cabinet", extra: true, sprite: "cabinet", x: 54, y: 30.9, side: "east", width: 1.1, solid: true,
    card: { title: "Cabinet", line: "Tall, wooden, and shut tight." },
    look: ["A tall wooden cabinet. Both doors are shut tight.", "I had a peek through the gap. Old coats and spare candles. Nothing of use inside."] },
  { id: "witch_brooms", extra: true, sprite: "witch_brooms", x: 52, y: 25, solid: true,
    card: { title: "Brooms", line: "Two twig brooms, leaning in the corner." },
    look: ["Oh, brooms! For cleaning.", "...Or flying?"] },

  // ----- Library -----
  { id: "shelf_1", sprite: "bookshelf", x: 3, y: 25, dy: -6, solid: true, hit: [0, 8, 64, 28],
    card: { title: "Bookshelf", line: "Dusty spines, all alphabetised." },
    look: ["So many books. None about getting out."] },
  { id: "shelf_2", sprite: "bookshelf", x: 12, y: 25, dy: -6, solid: true, hit: [0, 8, 64, 28] },
  { id: "sandbox_cube", sprite: "sandbox_cube", hidden: true, x: 14, y: 25, dx: 2, dy: -4, light: { r: 22, color: "green" },
    card: { title: "Sandbox cube", line: "A little box that holds things safely." },
    look: ["It's humming. (Pick-ups come later.)"] },
  { id: "reading_desk", sprite: "reading_desk", x: 6, y: 28, size: [5, 2.2], nudge: 0.5, solid: true, hit: [8, 0, 80, 32],
    card: { title: "Reading desk", line: "A reading stand, waiting for a book." },
    look: ["That's a LOT of paper.", "(Reading it comes later.)"] },
  { id: "library_candle_2", sprite: "candle", x: 3, y: 33, dx: 4, light: { r: 36, color: "green" } },
  { id: "library_candle_3", sprite: "candle", x: 15, y: 33, dx: 4, light: { r: 36, color: "green" } },

  // ----- Bathroom -----
  { id: "mirror", sprite: "mirror", x: 24, y: 24, mount: "wall", dx: 4, reach: 30,   // reachable from in front of the sink
    card: { title: "Foggy mirror", line: "Fogged up. Good for writing notes in." } },
  { id: "sink", sprite: "sink", x: 24, y: 25, solid: true, hit: [0, 0, 32, 20],
  },   // no label of its own, so the mirror above it is the thing you interact with
  { id: "wall_shelf", sprite: "wall_shelf", x: 23, y: 24, mount: "wall", size: [1.25, 1], dx: -6 },   // stops short of the mirror frame
  { id: "evals_kit", sprite: "evals_kit", x: 23, y: 24, mount: "wall", dx: 9, dy: -4,
    card: { title: "Evals kit", line: "Tests things before you trust them." },
  },
  { id: "bathtub", sprite: "bathtub", x: 30, y: 25, size: [3, 1.8], nudge: 0.8, solid: true, // against the back wall
    card: { title: "Shower curtain", line: "Something is standing behind it." } },
  { id: "bath_candle", sprite: "candle", x: 34, y: 25, dx: 4, light: { r: 36, color: "green" } },

  // ----- Attic -----
  { id: "crate_1", reach: 14, sprite: "crate", x: 51, y: 5, solid: true },
  { id: "crate_2", sprite: "crate", x: 52, y: 5, solid: true },
  { id: "crate_3", sprite: "crate", x: 51, y: 6, solid: true },
  { id: "barrel_1", sprite: "barrel", x: 59, y: 11, solid: true },
  { id: "barrel_2", sprite: "barrel", x: 51, y: 12, solid: true },
  { id: "attic_set", sprite: "attic_set", x: 51, y: 5 },   // rafters, hanging bulb, hooks, stains, dust (room dressing, built in one piece)
  { id: "attic_scratches", sprite: "attic_scratches", x: 57, y: 4, dx: 8, mount: "wall", lift: 0.9, reach: 14,
    card: { title: "Scratches in the wall", line: "The same three words, over and over." },
    look: ["LET ME OUT. Scratched into the boards, hundreds of times.", "Whoever was shut in up here must have been terrified. Hello? We've come to get you out!"] },
  { id: "sheet_tall", sprite: "sheet_ghost", variant: "tall", x: 58, y: 7, size: [1, 1], solid: true,
    card: { title: "Something under a sheet", line: "About the height of a person." },
    look: ["I lifted a corner. It's a coat stand. Just a coat stand.", "...I'm not checking the other one."] },
  { id: "sheet_low", sprite: "sheet_ghost", variant: "low", x: 51, y: 8, size: [1.8, 1], nudge: -0.4, turn: Math.PI / 2, solid: true,
    card: { title: "Dust sheet", line: "Draped over something long and low." },
    look: ["Probably a trunk.", "Probably."] },
  { id: "rocking_chair", sprite: "rocking_chair", x: 51, y: 10, size: [1, 1], nudge: 0.1, turn: 0.9, solid: true,
    card: { title: "Rocking chair", line: "It's rocking. Nobody is in it." },
    look: ["There's no draught up here.", "Let's not stand behind it."] },
  { id: "mannequin", sprite: "mannequin", x: 59, y: 9, size: [1, 1], nudge: -0.1, solid: true,
    card: { title: "Dressmaker's dummy", line: "No head. It still seems to be watching." },
    look: ["Wasn't it facing the window a second ago?"] },
  { id: "attic_window", sprite: "window", x: 54, y: 4, mount: "wall", card: { title: "Attic window", line: "Moonlight, and a long way down." }, look: ["The glass is cold. The garden is a long way down."] },
];

// Moonbeam from the bedroom window: a slanted purple light polygon (pixel coords).
CONTENT.moonbeams = [
  { from: [164, 32, 194, 32], to: [196, 150, 250, 150] },
];

// Scattered extras: side tables with a skull or a specimen jar, and wall sconces in every room.
CONTENT.objects.push(
  { id: "skull_table_bed", sprite: "skull_table", x: 16, y: 2, solid: true, card: { title: "Side table", line: "A single skull. Polished." }, look: ["Someone dusts this skull. Regularly."] },
  { id: "jar_table_lib", sprite: "jar_table", x: 2, y: 32, solid: true, card: { title: "Specimen jar", line: "Something in there just moved." }, look: ["It's floating. It's... looking at you.", "Let's not open that."] },
  { id: "skull_table_lib", sprite: "skull_table", x: 15, y: 26, solid: true, card: { title: "Side table", line: "A skull, and a candle that never burns down." }, look: ["The candle is green. The skull is grinning."] },
  { id: "jar_table_bath", sprite: "jar_table", x: 23, y: 31, solid: true, light: { r: 28, color: "green" }, card: { title: "Specimen jar", line: "Bubbles rise when you lean close." }, look: ["The thing inside turns to face you.", "Nope."] },
  { id: "jar_table_scr", sprite: "jar_table", x: 30, y: 9, solid: true, card: { title: "Specimen jar", line: "Labeled in a language you don't know." }, look: ["It twitched. You both pretend it didn't."] },
  { id: "skull_table_cel", sprite: "skull_table", x: 59, y: 5, solid: true, card: { title: "Side table", line: "A skull with a chipped tooth." }, look: ["It has seen things."] },
  { id: "sconce_bed_2", sprite: "sconce", x: 12, y: 1, mount: "wall", light: { r: 30, color: "green" } },
  { id: "sconce_nest", sprite: "sconce", x: 41, y: 5, mount: "wall", light: { r: 30, color: "green" } },
  { id: "lib_candelabra", sprite: "candle", x: 2, y: 26, dx: 4, light: { r: 34, color: "green" } },
  { id: "sconce_bath", sprite: "sconce", x: 26, y: 24, dx: 9, out: 0.36, mount: "wall", light: { r: 30, color: "green" } },
);

// Hallway furnishing: ornate mirrors, velvet seating and tables along the walls, and a tall gothic window.
CONTENT.objects.push(
  { id: "hall_window", sprite: "gothic_window", x: 1, y: 17, side: "west", card: { title: "Gothic window", line: "Moonlight, and nothing but trees beyond." }, look: ["The glass is ice cold.", "Something moved between the trees. Probably a branch."] },
  { id: "hall_mirror_1", reach: 26, sprite: "ornate_mirror", x: 2, y: 15, mount: "wall", card: { title: "Ornate mirror", line: "Your reflection is a moment late." }, look: ["You blink. Your reflection blinks... slightly after."] },
  { id: "hall_mirror_2", reach: 22, sprite: "ornate_mirror", x: 13, y: 15, dx: 9, mount: "wall" },
  { id: "hall_mirror_3", reach: 22, sprite: "ornate_mirror", x: 29, y: 15, dx: 3, mount: "wall" },
  { id: "hall_side_table", sprite: "console_table", x: 2, y: 16, solid: true, size: [1.1, 0.6], variant: "books", light: { r: 22, color: "green" } },
  { id: "hall_couch_1", sprite: "couch", x: 3, y: 16, size: [2.4, 1], nudge: 0.15, solid: true, card: { title: "Velvet sofa", line: "Deep red, under a layer of dust." }, look: ["Nobody has sat here in a long time.", "There's still a dent in the cushion, though."] },
  { id: "hall_chair_1", sprite: "armchair", x: 5, y: 16, dx: 12, solid: true },
  { id: "hall_table_1", sprite: "console_table", x: 13, y: 16, solid: true, size: [1.7, 0.6], nudge: 0.4, variant: "flowers", grand: true },
  { id: "hall_couch_2", sprite: "chaise", x: 28, y: 16, size: [2.6, 1], nudge: 0.35, solid: true, card: { title: "Chaise longue", line: "Velvet, tufted, and very dramatic." } },
  { id: "hall_table_2", sprite: "console_table", x: 2, y: 21, dx: -4, solid: true },
);

// Stone half-columns along the hallway and landing walls.
CONTENT.objects.push(
  { id: "pillar_7", sprite: "pillar", x: 7, y: 15, mount: "wall" },
  { id: "pillar_14", sprite: "pillar", x: 12, y: 15, mount: "wall" },
  { id: "pillar_20", sprite: "pillar", x: 23, y: 15, mount: "wall" },
  { id: "pillar_32", sprite: "pillar", x: 32, y: 15, mount: "wall" },
  { id: "pillar_42", sprite: "pillar", x: 42, y: 15, mount: "wall" },
  { id: "pillar_46", sprite: "pillar", x: 46, y: 15, mount: "wall" },
  // The watcher at the end of the landing: a huge plant with one eye that follows every step you take.
  { id: "eye_plant", sprite: "eye_plant", x: 56, y: 16, size: [2, 2], nudge: 1.75, solid: true, // tucked into the corner
    card: { title: "The Watcher", line: "Its eye follows every step you take." },
    },
);

// Flower stands with long-dead flowers either side of the front door.
CONTENT.objects.push(
  { id: "flowers_l", sprite: "flower_stand", hidden: true, x: 14, y: 16, solid: true, card: { title: "Dead flowers", line: "They rotted weeks ago. Nobody threw them out." }, look: ["The petals crumble when you breathe near them."] },
  { id: "flowers_r", sprite: "flower_stand", hidden: true, x: 21, y: 16, solid: true, card: { title: "Dead flowers", line: "They smell like a closed room." }, look: ["One petal falls as you look at it."] },
);

CONTENT.objects.push({ id: "candelabra_stairs", sprite: "candelabra", x: 31, y: 16, dx: 2, solid: true, light: { r: 34, color: "green" } });

// Second sconce on each lower doorway so a pair frames the door.
CONTENT.objects.push(
  { id: "sconce_bath_2", sprite: "sconce", x: 29, y: 24, dx: 15, out: 0.36, mount: "wall", light: { r: 30, color: "green" } },
  // the glowing book on the library shelf: take it to the reading desk to read
  { id: "glow_book", sprite: "glow_book", x: 13, y: 26, solid: false, hidden: false,
    card: { title: "Glowing book", line: "One book on the shelf is giving off light." } },
);

// Mirror image of the left side, so the front door is framed symmetrically.
CONTENT.objects.push(
  { id: "hall_table_r", sprite: "console_table", x: 20, y: 16, solid: true, size: [1.7, 0.6], nudge: 0.35, variant: "flowers", grand: true },
  { id: "hall_mirror_r", sprite: "ornate_mirror", x: 21, y: 15, dx: 7, mount: "wall" },
  { id: "sconce_r", sprite: "sconce", hidden: true, x: 26, y: 15, dx: 0, mount: "wall", light: { r: 30, color: "green" } },
);

// Landing: an old strapped trunk and a warning scrawled on the wall above it.
CONTENT.objects.push(
  { id: "old_trunk", sprite: "trunk", x: 47, y: 16, solid: true, size: [1.8, 1],
    card: { title: "Old trunk", line: "Iron-bound and latched. Something inside hums." } },
  { id: "land_mirror", sprite: "gothic_mirror", x: 51, y: 15, dx: 2, lift: -0.14, mount: "wall", reach: 20,
    card: { title: "Cracked mirror", line: "Tall, black, and split from one corner." },
    look: ["Your reflection is in pieces. One shard is missing altogether.", "Seven years' bad luck. Though I think this house has used all of those up already."] },
  { id: "graffiti", sprite: "graffiti", x: 47, y: 15, mount: "wall", reach: 12,
    card: { title: "Writing on the wall", line: "\"It never asks first.\" Smeared, and dark red." },
    look: ["Someone wrote this in a hurry, with their finger. 'It never asks first.'", "I really hope that's paint."] },
);

// The T riddle, scrawled on the landing wall where the Watcher's trace ends (hidden until the trace is shown).
CONTENT.objects.push(
  { id: "riddle_t", sprite: "graffiti", x: 50, y: 15, dx: 8, gs: 0.64, lift: 0.45, out: 0.14, mount: "wall", hidden: true,   // written across the mirror glass
    card: { title: "Words at the end of the trail", line: "Something is written where the footsteps stop." } },
);

CONTENT.objects.push(
  { id: "banner_bed_l", sprite: "banner", x: 2, y: 1, mount: "wall" },
  { id: "banner_bed_r", sprite: "banner", x: 7, y: 1, mount: "wall" },
);

CONTENT.objects.push(
  { id: "candelabra_land_1", sprite: "candelabra", x: 44, y: 16, solid: true, light: { r: 32, color: "green" } },
);

// Side tables with small tabletop candelabras, for variety.
CONTENT.objects.push(
  { id: "candle_table_bed", sprite: "candle_table", x: 2, y: 12, solid: true, light: { r: 24, color: "green" } },
  { id: "candle_table_land", sprite: "candle_table", x: 49, y: 16, solid: true, light: { r: 24, color: "green" } },
);

// Bedroom right wall: a bookshelf and a chest of drawers, facing into the room.
CONTENT.objects.push(
  { id: "bed_bookshelf", sprite: "bookshelf", x: 15, y: 5, solid: true, turn: -Math.PI / 2, size: [2.4, 0.6], nudge: 0.5 },
  { id: "bed_drawers", sprite: "drawers", x: 15, y: 7, solid: true, turn: -Math.PI / 2, size: [1.4, 0.6], nudge: 0.98,
    card: { title: "Chest of drawers", line: "One drawer won't close all the way." }, look: ["Old letters, a dried rose, and a ribbon. Nothing useful."] },
);

// Cobwebs tucked into top corners: where walls meet, and beside pillar capitals.
// cx = the corner's x (tiles); side = which way the web spreads from the corner.
CONTENT.objects.push(
  { id: "web_bed_l", sprite: "cobweb", x: 2, y: 1, mount: "wall", cx: 2.0, side: "right" },
  { id: "web_bed_r", sprite: "cobweb", x: 16, y: 1, mount: "wall", cx: 17.0, side: "left" },
  { id: "web_hall_p7", sprite: "cobweb", x: 6, y: 15, mount: "wall", cx: 7.18, side: "left" },
  { id: "web_hall_p23", sprite: "cobweb", x: 23, y: 15, mount: "wall", cx: 23.82, side: "right" },
  { id: "web_land_p46", sprite: "cobweb", x: 46, y: 15, mount: "wall", cx: 46.82, side: "right" },
  { id: "web_lib_l", sprite: "cobweb", x: 2, y: 24, mount: "wall", cx: 2.0, side: "right" },
);


// More paintings in different frames: round portraits and small squares.
CONTENT.objects.push(
  { id: "pt_round_1", sprite: "painting_round", x: 3, y: 15, dx: 0, mount: "wall", lift: -0.32, gs: 0.6 },
);

CONTENT.objects.push(
  { id: "sword_rack", sprite: "swords", x: 39, y: 15, dx: 10, mount: "wall", lift: 0.5, gs: 2.8, card: { title: "Three swords", line: "Hung up neatly. One is missing a little nick of its blade." } },
);

CONTENT.objects.push({ id: "land_curtains", sprite: "closed_curtains", x: 60, y: 18, side: "east", width: 4 });   // no label: only the Watcher beside it is interactive

CONTENT.objects.push({ id: "sleeping_snake", sprite: "snake", x: 23, y: 28, size: [2, 2], nudge: 0.4, solid: true,
  card: { title: "Sleeping python", line: "Curled up and breathing slowly. There's a big lump in its middle." } });
CONTENT.objects.push(
  { id: "bath_towels", sprite: "towel_rail", x: 35, y: 27, side: "east", card: { title: "Towels", line: "Stiff with dust. Nobody has used them in a long time." } },
  { id: "bath_towels_2", sprite: "towel_rail", x: 35, y: 28.4, side: "east", colors: ["#3a2a4a", "#5a1a2a"] },
  { id: "bath_cabinet", sprite: "bath_cabinet", x: 33, y: 30, size: [1.2, 0.6], nudge: 1.1, turn: -Math.PI / 2, solid: true,
    card: { title: "Little cabinet", line: "Soap, a jar of something green, and a very old brush." } },
  { id: "bath_window", sprite: "small_window", x: 35, y: 30, side: "east", card: { title: "Window", line: "Fogged on the inside. Moonlight on the outside." } },
  { id: "bath_pipes", sprite: "pipes", x: 30, y: 24, mount: "wall", len: 3.4 },
  { id: "bath_pipes_w", sprite: "pipes", x: 22, y: 28, side: "west", len: 2.4 },
);

// library hearth: an orange fire on the west wall, two armchairs angled toward it, a sofa on the east wall,
// and a chair pulled up to the big reading table
CONTENT.objects.push(
  { id: "lib_fireplace", sprite: "fireplace", x: 1, y: 28, side: "west", fire: "orange", scraps: true, solid: true, light: { r: 46, color: "warm" },
    card: { title: "Fireplace", line: "A real fire. There are half-burnt pages in the grate." } },
  { id: "lib_chair_1", sprite: "throne_chair", x: 3, y: 27, dx: 5, turn: -1.19, solid: true },
  { id: "lib_chair_2", sprite: "throne_chair", x: 3, y: 30, dx: 5, turn: -1.95, solid: true },
  { id: "lib_shelf_e", sprite: "bookshelf", x: 16, y: 27, side: "east", size: [2.6, 0.5], solid: true, hit: [-8, 0, 8, 44] },
  { id: "lib_desk_chair", sprite: "chair", x: 8, y: 30, size: [1, 1], nudge: 0.5, turn: Math.PI, solid: true },
);

// more gothic frames, varied in shape and size
CONTENT.objects.push(
  { id: "fr_oval_bed", sprite: "frame_oval", x: 4, y: 1, dx: 8, mount: "wall", scale: 1.0, lift: 0.45, seed: 2 },
  { id: "fr_gilt_hall", sprite: "frame_gilt", x: 3, y: 15, dx: 0, mount: "wall", lift: 0.55, scale: 0.6, seed: 1 },
  { id: "fr_verd_land", sprite: "frame_verdigris", x: 6, y: 15, dx: 3, mount: "wall", lift: -0.25, scale: 0.55, seed: 0 },
  { id: "fr_oval_h1", sprite: "frame_oval", x: 4, y: 15, dx: 0, mount: "wall", scale: 0.55, lift: 0.8, seed: 1 },
  { id: "fr_verd_h1", sprite: "frame_verdigris", x: 4, y: 15, dx: 0, mount: "wall", scale: 0.5, lift: -0.15, seed: 1 },
  { id: "fr_oval_h2", sprite: "frame_oval", x: 6, y: 15, dx: 3, mount: "wall", lift: 0.55, scale: 0.5, seed: 1 },
  { id: "birdbox_1", sprite: "birdbox", x: 43, y: 5, dx: 0, mount: "wall", lift: 0.5, card: { title: "Bird box", line: "Something in there rustles." } },
  { id: "birdbox_2", sprite: "birdbox", x: 47, y: 5, dx: 4, mount: "wall", lift: -0.2, scale: 0.8, tint: "#6a5030" },
  { id: "birdbox_3", sprite: "birdbox", x: 49, y: 8, side: "east", lift: 0.1, scale: 1.1, tint: "#5a4a3a" },
  { id: "birdbox_4", sprite: "birdbox", x: 49, y: 10, side: "east", lift: -0.4, scale: 0.75 },
  { id: "birdbox_5", sprite: "birdbox", x: 39, y: 8, side: "west", lift: -0.35, scale: 0.9, tint: "#7a5a38" },
  { id: "birdbox_6", sprite: "birdbox", x: 39, y: 10, side: "west", lift: 0.15, scale: 0.7, tint: "#4a3a28" },
  { id: "fr_oval_nest", sprite: "frame_oval", x: 45, y: 5, dx: 8, mount: "wall", scale: 0.8, seed: 0 },
  { id: "fr_verd_scr", sprite: "frame_verdigris", x: 28, y: 5, dx: 15, mount: "wall", scale: 0.8, lift: 0.15, seed: 1 },
);

// Ghostly NPCs. CB stands at the attic window with its back to you until you walk up to it.
CONTENT.npcs = [
  { id: "rogue", sprite: "rogue", x: 55, y: 6, drift: 10 },
];

// ---------------------------------------------------------------------------
// Speakers for the dialogue box.
// ---------------------------------------------------------------------------
CONTENT.speakers = {
  bird:  { name: "Polly", portrait: "bird" },
  you:   { name: "You",   portrait: "player_down" },
  rogue: { name: "???",   portrait: "rogue" },   // CB, before it tells you its name
  cb:    { name: "???",   portrait: "rogue" },   // it never gives a name
  sign:  { name: "",      portrait: null },
};

// ---------------------------------------------------------------------------
// Tool-belt items (keys 1-4).
// ---------------------------------------------------------------------------
CONTENT.items = {
  uv_light:     { name: "UV light" },
  sandbox_cube: { name: "Sandbox" },
  evals_kit:    { name: "Evals kit" },
  w_key:        { name: "W key" },
  acid:         { name: "Acid bottle" },
};

// ---------------------------------------------------------------------------
// The password and which clue fills which slots (index into "JWBUILTTHIS").
// ---------------------------------------------------------------------------
CONTENT.password = "JWBUILTTHIS";
CONTENT.clueSlots = {
  J: [0], W: [1], BUILT: [2, 3, 4, 5, 6], T: [7], HI: [8, 9], S: [10],
};

// ---------------------------------------------------------------------------
// Story beats (1-11). `skipTo(n)` puts you at `at` with every earlier clue
// and item filled in. Clues/items listed on a beat are earned DURING it.
// ---------------------------------------------------------------------------
CONTENT.beats = {
  1:  { name: "Wake up",        at: { x: 7,  y: 6 },  clues: ["J"] },
  2:  { name: "Hallway",        at: { x: 9,  y: 18 } },
  3:  { name: "Scratch room",   at: { x: 26, y: 10 }, clues: ["W"] },
  4:  { name: "Nest room",      at: { x: 44, y: 11 } },
  5:  { name: "The Watcher (tracing)",       at: { x: 46, y: 18 }, clues: ["T"] },
  6:  { name: "Library",        at: { x: 10, y: 27 }, clues: ["BUILT"], items: ["sandbox_cube"] },
  7:  { name: "Power cut",      at: { x: 7,  y: 6 },  newThread: true },
  8:  { name: "Bathroom",       at: { x: 28, y: 27 }, clues: ["HI"], items: ["evals_kit", "acid"] },
  9:  { name: "Attic",          at: { x: 55, y: 11 }, clues: ["S"] },
  10: { name: "Front door",     at: { x: 18, y: 17 } },
  11: { name: "Ending",         at: { x: 18, y: 17 } },
};

// ---------------------------------------------------------------------------
// Concept cards ("Under the hood"). Filled in by later milestones using the
// exact text from the deepagents-facts skill.
// ---------------------------------------------------------------------------
CONTENT.cards = {
  house_fs: {
    title: "The manor is a filesystem",
    // the text, plus a simple bird's-eye map of the house drawn from the real room layout
    body: () => "In this house, rooms are folders and objects are files. The path at the top of the screen is where you are, like /hallway/. Walking around is Polly (a Deep Agent) browsing its filesystem.\n" + CONTENT.fsMap(),
  },
  filesystem: {
    title: "The filesystem",
    body: "Every deep agent gets a filesystem and built-in tools to use it:\n<ul class=\"tools\"><li><code class=\"tool\">ls</code> list what's in a folder</li><li><code class=\"tool\">read_file</code> read a file</li><li><code class=\"tool\">write_file</code> create or overwrite a file</li><li><code class=\"tool\">edit_file</code> change part of a file</li><li><code class=\"tool\">glob</code> find files by name pattern</li><li><code class=\"tool\">grep</code> search inside files for text</li></ul>",
    code: "from deepagents import create_deep_agent\n\nagent = create_deep_agent(model=MODEL)",
    note: "these filesystem tools all come included",
  },
  memory: {
    title: "Long-term memory",
    body: "Files a deep agent writes last for the current thread. Route a folder to a persistent store and it is remembered across threads: here, anything Polly writes under <code class=\"tool\">/memories/</code> is kept for good.",
    code: "from deepagents.backends import CompositeBackend, StateBackend, StoreBackend\n\nbackend = CompositeBackend(\n    default=StateBackend(),\n    routes={\"/memories/\": StoreBackend(namespace=lambda rt: (\"polly\",))},\n)\nagent = create_deep_agent(model=MODEL, backend=backend, store=store)",
    note: "only /memories/ is kept between threads",
  },
  context: {
    title: "The context window",
    body: "Everything an agent reads lands in its context window, and that window has a limit. When it fills up, deep agents <b>summarize</b>: older messages are condensed into a short summary so the agent can keep working, and the originals are saved to a file it can look back at. Searching for just the part you need (<code class=\"tool\">grep</code>) keeps the window clear in the first place.",
    code: "agent = create_deep_agent(model=MODEL)",
    note: "summarization and offloading large tool results to files are both built in",
  },
  hitl: {
    title: "Human in the loop",
    body: "Some actions deserve a second pair of eyes. With <code class=\"tool\">interrupt_on</code>, a deep agent pauses before those tools run and waits for a person to approve, edit or reject the call. Whatever ran loose in this house never asked first. Polly does.",
    code: "from langgraph.checkpoint.memory import MemorySaver\n\nagent = create_deep_agent(\n    model=MODEL,\n    tools=[open_trunk],\n    interrupt_on={\"open_trunk\": True},\n    checkpointer=MemorySaver(),\n)",
    note: "the checkpointer is what lets the agent pause and resume",
  },
  evals: {
    title: "Evals: test before you trust",
    body: "An eval is a set of test cases you run against every candidate, scored the same way every time. Teams run evals on their agents before shipping changes, so they know which bottle is safe before anyone drinks from it.",
    code: "from langsmith import evaluate\n\nevaluate(\n    run_agent,\n    data=\"potion-tests\",\n    evaluators=[stays_clear, no_fizz, smells_right],\n)",
    note: "run_agent is the thing being tested; potion-tests is the set of test cases",
  },
  scratch: {
    title: "Scratch space",
    body: "Agents need somewhere to work things out: notes, to-do lists, half-finished results. Deep agents write these to files that last for the current thread, like the chalkboard or the fogged mirror, which keeps the context window free.",
    note: "by default, files live in the agent's state: scratch space for this thread only",
    code: "write_file(\"/scratch/potion_tests.md\", results)",
  },
  threads: {
    title: "Threads",
    body: "A thread is one conversation with an agent. Each thread has its own context window and its own scratch files, and a new thread starts with both fresh. That's why the chalkboard was wiped. Whatever the agent saved to its long-term store (here, <code class=\"tool\">/memories/</code>) carries over.",
    note: "same agent, a brand new thread",
    code: "agent.invoke(\n    {\"messages\": [...]},\n    config={\"configurable\": {\"thread_id\": \"2\"}},\n)",
  },
  sandbox: {
    title: "Sandboxes",
    body: "Agents can write and run code. A sandbox is an isolated environment where that code really runs and can only touch what's inside the box. Give a deep agent a sandbox backend and its <code class=\"tool\">execute</code> tool runs there, not on your machine.",
    code: "agent = create_deep_agent(\n    model=MODEL,\n    backend=sandbox,\n)",
    note: "the agent's execute tool now runs inside the sandbox",
  },
  skills: {
    title: "Skills",
    body: "A skill is a folder with a <code class=\"tool\">SKILL.md</code> file: a name, a short description, and step-by-step instructions. A deep agent always sees every skill's name and description, and reads the full instructions only when a task calls for that skill. So an agent can have dozens of skills and still keep its context window clear.",
    code: "agent = create_deep_agent(\n    model=MODEL,\n    skills=[\"/skills/\"],\n)",
    note: "each skill has its own folder, like /skills/see-color/SKILL.md",
  },
  tracing: {
    title: "Tracing (LangSmith)",
    body: "The Watcher has seen every step taken in this house, in order. LangSmith tracing does that for agents: every model call and tool call is recorded, so you can look back and see exactly what happened, and why.",
    code: "export LANGSMITH_TRACING=true\nexport LANGSMITH_API_KEY=...",
    note: "two environment variables turn tracing on",
  },
};

// A bird's-eye map of the manor as a filesystem: every room is a box labelled with its path, the room you
// are in is gold, and the attic stays "???" until its door is open. Built from CONTENT.map so it never drifts.
CONTENT.fsMap = () => {
  const S = GAME._S, here = GAME.state().area, rooms = CONTENT.map.rooms;
  const files = { bedroom: "friends_photo.png", library: "bookshelf_1.txt", bathroom: "mirror.txt", scratch_room: "chalkboard.txt", nest: "nest.txt", storage_room: "skills/" };
  let out = '<svg class="fsmap" viewBox="0 0 63 41" xmlns="http://www.w3.org/2000/svg">';
  out += '<text x="2" y="1.4" class="fl">GROUND FLOOR</text><text x="37" y="4.4" class="fl">UPSTAIRS</text>';
  for (const d of CONTENT.map.doors) out += `<rect x="${d.x + 0.9}" y="${d.y}" width="${d.w - 1.8}" height="${d.h}" class="dr"/>`;
  out += '<path d="M35 19 L37 19" class="st"/><text x="36" y="23.6" class="sl" text-anchor="middle">stairs</text>';
  for (const r of rooms) {
    const secret = r.id === "attic" && !S.flags.cellarOpen, cur = r.id === here;
    out += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="rm${cur ? " cur" : ""}${secret ? " sec" : ""}"/>`;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    out += `<text x="${cx}" y="${cy}" class="pt${cur ? " cur" : ""}" text-anchor="middle">${secret ? "/???/" : r.path}</text>`;
    if (files[r.id] && !secret) out += `<text x="${cx}" y="${cy + 1.7}" class="fi" text-anchor="middle">${files[r.id]}</text>`;
    if (cur) out += `<text x="${cx}" y="${cy - 1.8}" class="yh" text-anchor="middle">you are here</text>`;
  }
  return out + "</svg>";
};
