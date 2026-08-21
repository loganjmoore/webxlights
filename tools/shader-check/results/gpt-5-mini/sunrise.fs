/*{
  "DESCRIPTION": "a sunrise slowly rising from the bottom",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.02, 0.02, 0.20, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.00, 0.40, 0.05, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.00, 0.90, 0.30, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "glowRadius", "TYPE": "float", "MIN": 0.01, "MAX": 0.60, "DEFAULT": 0.15 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // If the buffer is a roofline (very short vertically), run the animation along X instead of Y.
  bool isLine = (RENDERSIZE.y < 2.0);
  float axis = isLine ? uv.x : uv.y;

  // Time base: keep nonzero to avoid exact zero-speed division issues.
  float t = TIME * (0.03 * speed + 0.00001);

  // Smooth periodic rise: sin gives a continuous up-and-down loop.
  // Phase shift so at t=0 the sun starts near the bottom.
  float rise = 0.5 * (1.0 + sin(t * 6.283185 - 1.570796));

  // Sky gradient: mix from night color (colorA) to dawn color (colorB) around the rising horizon.
  float grad = 0.18; // control softness of the horizon band
  float horizonBlend = smoothstep(rise - grad, rise + grad, axis);
  vec3 sky = mix(colorA.rgb, colorB.rgb, horizonBlend);

  // Warm scattering above the horizon to give a sunrise glow.
  float scatter = smoothstep(rise - grad * 2.0, rise + grad * 0.5, axis);
  vec3 warmSky = mix(sky, colorB.rgb, scatter * 0.6);

  // Sun core / glow based on distance from the rising position along the chosen axis.
  float dist = abs(axis - rise);
  float glow = 1.0 - smoothstep(0.0, glowRadius, dist); // 1.0 at center, 0.0 at glowRadius
  glow = pow(glow, 1.0); // keep shape easy to tweak later if desired

  // Strong sun core plus softer outer glow.
  vec3 sunCore = colorC.rgb * (glow * 2.0);
  vec3 sunHalo = colorB.rgb * (glow * 0.8 * (1.0 - dist / max(0.0001, glowRadius)));

  // Combine layers with high contrast for night viewing.
  vec3 color = warmSky + sunHalo + sunCore;
  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
