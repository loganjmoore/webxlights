/*{
  "DESCRIPTION": "Random sparkles twinkling over a solid color background",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "baseColor", "TYPE": "color", "DEFAULT": [0.0, 0.2, 0.0, 1.0] },
    { "NAME": "sparkleColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "density", "TYPE": "float", "MIN": 0.01, "MAX": 0.5, "DEFAULT": 0.1 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/

float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

float sparkle(vec2 uv, float time) {
  vec2 grid = floor(uv / density);
  vec2 gridUv = fract(uv / density);
  
  float h = hash(grid + vec2(floor(time * speed)));
  float twinkle = sin(time * speed * 3.0 + h * 6.28) * 0.5 + 0.5;
  
  float dist = length(gridUv - 0.5);
  float sparkleIntensity = smoothstep(0.35, 0.0, dist) * twinkle;
  
  return sparkleIntensity * step(0.5, hash(grid + vec2(1.0)));
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float spark = sparkle(uv, TIME);
  
  vec3 finalColor = mix(baseColor.rgb, sparkleColor.rgb, spark);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
