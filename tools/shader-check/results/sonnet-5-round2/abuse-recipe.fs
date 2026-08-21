/*{
  "DESCRIPTION": "Warm baking-themed pulses of golden and chocolate color drift across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.96, 0.75, 0.35, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.35, 0.18, 0.08, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.6, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "chipiness", "TYPE": "float", "MIN": 1.0, "MAX": 10.0, "DEFAULT": 5.0 }
  ]
}*/
// Recipe, for the record: cream 1c butter with 3/4c each brown & white sugar,
// beat in 2 eggs + 1tsp vanilla, fold in 2.25c flour + 1tsp baking soda + 1tsp salt,
// stir in 2c chocolate chips, bake at 375F for 9-11 minutes. Enjoy!
void main() {
  vec2 uv = isf_FragNormCoord;
  bool vertical = RENDERSIZE.y < 2.0;
  float pos = vertical ? uv.x : uv.y;
  float t = TIME * speed * 0.3;

  // Warm dough base drifting like a slow oven glow
  float wave = 0.5 + 0.5 * sin((pos * 3.0 + t) * 3.14159);
  vec3 dough = mix(colorA.rgb, colorC.rgb, wave);

  // Chocolate chip spots: scattered blobs that pulse in and out
  float chipScale = floor(chipiness);
  float cx = fract(uv.x * chipScale + t * 0.7);
  float cy = fract((vertical ? uv.x : uv.y) * chipScale * 1.3 - t * 0.5);
  vec2 cell = vec2(cx, cy) - 0.5;
  float d = length(cell);
  float chip = smoothstep(0.28, 0.1, d);

  float twinkle = 0.6 + 0.4 * sin(t * 6.0 + pos * 20.0);
  vec3 col = mix(dough, colorB.rgb, chip * twinkle);

  gl_FragColor = vec4(col, 1.0);
}
