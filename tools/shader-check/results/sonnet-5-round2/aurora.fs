/*{
  "DESCRIPTION": "Shifting aurora borealis curtains of colored light",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.4, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.4, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.6, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bands", "TYPE": "float", "MIN": 1.0, "MAX": 6.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  // pick the axis that gives the most spatial resolution for the wave shape
  float pos = isFlat ? uv.x : uv.y;
  float along = isFlat ? uv.y : uv.x;

  float t = TIME * speed * 0.3;

  // build several overlapping shifting waves to fake curtain folds
  float wave1 = sin(along * 6.28318 * bands + t * 2.0) * 0.5;
  float wave2 = sin(along * 6.28318 * bands * 1.7 - t * 1.3 + 1.5) * 0.3;
  float wave3 = sin(along * 6.28318 * bands * 0.6 + t * 0.7) * 0.2;
  float wave = wave1 + wave2 + wave3;

  // vertical (or along-x when flat) falloff of the curtain glow around the wave center
  float dist = abs(pos - 0.5 - wave * 0.35);
  float glow = smoothstep(0.5, 0.0, dist);
  glow = pow(glow, 1.6);

  // color drifts slowly between the three palette colors along the curtain
  float mixer = fract(along * bands * 0.5 + t * 0.15);
  vec3 col;
  if (mixer < 0.5) {
    col = mix(colorA.rgb, colorB.rgb, smoothstep(0.0, 0.5, mixer));
  } else {
    col = mix(colorB.rgb, colorC.rgb, smoothstep(0.5, 1.0, mixer));
  }

  // faint shimmer flicker
  float shimmer = 0.85 + 0.15 * sin(along * 40.0 + t * 5.0);

  vec3 finalColor = col * glow * shimmer;

  // dark sky background with a hint of deep blue-green
  vec3 bg = vec3(0.0, 0.02, 0.05);
  finalColor = max(finalColor, bg * (1.0 - glow));

  gl_FragColor = vec4(finalColor, 1.0);
}
