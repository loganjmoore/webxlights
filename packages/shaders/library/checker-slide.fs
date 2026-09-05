/*{
  "DESCRIPTION": "Big bold checkerboard squares sliding steadily sideways",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.8, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "squares", "TYPE": "float", "MIN": 2.0, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // 100 * 0.5 is whole, so the slide never jumps when the clock wraps.
  float t = mod(TIME * speed, 100.0);
  // Square squares: the count runs across the width, and the height gets as many as fit.
  float cx = uv.x * squares + t * 0.5;
  float cy = uv.y * squares / max(aspect, 0.25);
  float parity = mod(floor(cx) + floor(cy), 2.0);
  // A one-pixel dark seam between squares, so the board reads as squares and never blends two
  // palette colours through a muddy edge.
  float aaX = 1.2 * squares / max(RENDERSIZE.x, 8.0);
  float aaY = 1.2 * squares / max(aspect, 0.25) / max(RENDERSIZE.y, 8.0);
  float fx = fract(cx);
  float fy = fract(cy);
  float seam = smoothstep(0.0, aaX, fx) * smoothstep(1.0, 1.0 - aaX, fx) * smoothstep(0.0, aaY, fy) * smoothstep(1.0, 1.0 - aaY, fy);
  // On a line the seams would be dark bulbs between bright ones, so there the squares just butt.
  if (RENDERSIZE.y < 2.0) seam = 1.0;
  vec3 col = mix(colorA.rgb, colorB.rgb, parity);
  gl_FragColor = vec4(col * (0.15 + 0.85 * seam), 1.0);
}
