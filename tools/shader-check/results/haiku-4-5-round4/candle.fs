/*{
  "DESCRIPTION": "Warm candle flicker with dancing orange and yellow flames",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.5, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.0, 1.0] },
    { "NAME": "flickerSpeed", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "flameHeight", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

float pseudoRandom(float seed) {
  return fract(sin(seed * 12.9898) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float flameAmount = flameHeight;
  if (RENDERSIZE.y < 2.0) {
    uv.y = 0.5;
  } else {
    flameAmount = mix(0.2, flameHeight, smoothstep(0.0, 1.0, 1.0 - uv.y));
  }
  
  float noise1 = pseudoRandom(floor(TIME * flickerSpeed) + uv.x * 3.0);
  float noise2 = pseudoRandom(floor(TIME * flickerSpeed * 0.7) + uv.x * 5.0 + 17.3);
  float noise3 = pseudoRandom(floor(TIME * flickerSpeed * 0.3) + uv.x * 2.0 + 42.1);
  
  float flicker = mix(noise1, noise2, 0.5) + noise3 * 0.3;
  flicker = smoothstep(0.2, 0.8, flicker);
  
  float intensity = mix(0.5, 1.0, flicker);
  intensity *= smoothstep(1.0, 0.0, abs(uv.x - 0.5) * 3.0);
  
  vec3 flame = mix(colorA.rgb, colorB.rgb, flicker);
  flame *= intensity;
  
  gl_FragColor = vec4(flame, 1.0);
}
