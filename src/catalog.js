// The fixed catalogue. Shared by the server (products API) and the client (id lookups).
export const CATEGORIES = ['All', 'Kitchen', 'Home', 'Garden', 'Office'];
export const SORTS = ['Featured', 'Price: low to high', 'Price: high to low', 'Name: A to Z'];

export const PRODUCTS = [
  ['p01', 'Ceramic Mug', 'Kitchen', 12.0, 'Glazed stoneware, 350 ml'],
  ['p02', "Chef's Knife", 'Kitchen', 34.0, '20 cm carbon steel blade'],
  ['p03', 'Wooden Spoon Set', 'Kitchen', 9.5, 'Three beech spoons'],
  ['p04', 'Cast Iron Skillet', 'Kitchen', 39.0, 'Pre-seasoned, 26 cm'],
  ['p05', 'Glass Storage Jars', 'Kitchen', 24.0, 'Set of four, airtight lids'],
  ['p06', 'Linen Tea Towels', 'Kitchen', 14.0, 'Pack of two, stonewashed'],
  ['p07', 'Throw Blanket', 'Home', 45.0, 'Wool blend, 130 x 170 cm'],
  ['p08', 'Scented Candle', 'Home', 18.0, 'Cedar and fig, 40 h burn'],
  ['p09', 'Table Lamp', 'Home', 42.0, 'Brass base, linen shade'],
  ['p10', 'Photo Frame', 'Home', 15.0, 'Oak, fits 13 x 18 cm'],
  ['p11', 'Wall Clock', 'Home', 29.0, 'Silent sweep movement'],
  ['p12', 'Cushion Cover', 'Home', 16.0, 'Cotton, 45 x 45 cm'],
  ['p13', 'Watering Can', 'Garden', 22.0, 'Galvanised steel, 5 l'],
  ['p14', 'Pruning Shears', 'Garden', 19.0, 'Bypass blades, locking'],
  ['p15', 'Plant Pot Set', 'Garden', 27.0, 'Three terracotta pots'],
  ['p16', 'Garden Gloves', 'Garden', 11.0, 'Leather palm, size M'],
  ['p17', 'Bird Feeder', 'Garden', 25.0, 'Hanging, squirrel-proof'],
  ['p18', 'Seed Starter Kit', 'Garden', 13.0, 'Tray, lid and 24 pellets'],
  ['p19', 'Dot Grid Notebook', 'Office', 8.0, 'A5, 160 pages'],
  ['p20', 'Desk Organizer', 'Office', 21.0, 'Bamboo, five compartments'],
  ['p21', 'Gel Pens', 'Office', 7.0, 'Pack of ten, 0.5 mm'],
  ['p22', 'Monitor Stand', 'Office', 38.0, 'Walnut, with drawer'],
  ['p23', 'Sticky Notes', 'Office', 5.0, 'Six pastel pads'],
  ['p24', 'Laptop Sleeve', 'Office', 32.0, 'Felt, fits 14 inch'],
].map(([id, name, category, price, blurb]) => ({ id, name, category, price, blurb }));

export const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

const SORTERS = {
  'Price: low to high': (a, b) => a.price - b.price,
  'Price: high to low': (a, b) => b.price - a.price,
  'Name: A to Z': (a, b) => a.name.localeCompare(b.name),
};

export function queryProducts({ q = '', category = 'All', sort = 'Featured' } = {}) {
  const needle = q.trim().toLowerCase();
  const list = PRODUCTS.filter(
    (p) =>
      (category === 'All' || p.category === category) &&
      `${p.name} ${p.blurb} ${p.category}`.toLowerCase().includes(needle),
  );
  return SORTERS[sort] ? list.sort(SORTERS[sort]) : list;
}
