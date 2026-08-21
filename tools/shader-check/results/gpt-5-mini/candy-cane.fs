/*{
  "DESCRIPTION": "Candy cane diagonal stripes scrolling",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 40.0, "DEFAULT": 10.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.10 },
    { "NAME": "angle", "TYPE": "float", "MIN": 0.0, "MAX": 360.0, "DEFAULT": 45.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // If this is effectively a 1-pixel-tall strip, drive pattern along X so it still animates well
  if (RENDERSIZE.y < 2.0) {
    uv.y = uv.x;
  }

  // Convert angle to radians and build direction vector
  float ang = angle * (3.14159265 / 180.0);
  vec2 dir = vec2(cos(ang), sin(ang));

  // Position along the diagonal direction
  float pos = dot(uv, dir);

  // Ensure non-zero scale and softness
  float sc = max(scale, 0.001);
  float soft = max(softness, 0.001);

  // Scrolling offset (controls movement speed along the stripes)
  float offset = TIME * speed * 0.25;

  // Pattern coordinate and alternating band value with soft edges
  float pattern = fract(pos * sc - offset);
  float edge = 0.5 * soft; // half-width for smoothstep
  float band = smoothstep(0.5 - edge, 0.5 + edge, pattern);

  // Enhance contrast for a bright candy-cane look
  vec3 baseCol = mix(colorA.rgb, colorB.rgb, band);

  // Add a subtle glossy highlight that runs along each stripe to suggest rounded candy cane
  float gloss = pow(max(0.0, 1.0 - abs(fract((pos * sc - offset) * 2.0) - 0.5) * 2.0), 12.0);
  vec3 highlight = vec3(1.0, 1.0, 1.0) * (0.12 * gloss);

  // Slightly brighten the colored stripe more than the white stripe for richness
  float stripeTint = mix(1.0, 1.08, band); // tiny tint to colorA when band near 0
  vec3 color = baseCol * stripeTint + highlight * (1.0 - band * 0.5);

  // Final strong contrast clamp
  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
