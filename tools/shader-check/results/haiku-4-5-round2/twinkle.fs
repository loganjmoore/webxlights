/*{
  "DESCRIPTION": "Twinkling stars scattered across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "starColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "backgroundColor", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.2, 1.0] },
    { "NAME": "twinklSpeed", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "starDensity", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 }
  ]
}*/

float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 gridUv = uv * starDensity * 8.0;
  vec2 gridCell = floor(gridUv);
  vec2 gridPos = fract(gridUv);
  
  float closestDist = 2.0;
  float twinkle = 0.0;
  
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cell = gridCell + vec2(float(dx), float(dy));
      vec2 cellSeed = cell + vec2(0.5);
      
      float randomX = hash(cellSeed * 1.23);
      float randomY = hash(cellSeed * 4.56);
      float randomTwinkle = hash(cellSeed * 7.89);
      
      vec2 starPos = vec2(randomX, randomY);
      float dist = length(gridPos - starPos);
      
      if (dist < closestDist) {
        closestDist = dist;
        float phase = randomTwinkle * 6.28318 + TIME * twinklSpeed;
        twinkle = sin(phase) * 0.5 + 0.5;
        twinkle *= smoothstep(0.15, 0.0, dist);
      }
    }
  }
  
  vec3 color = mix(backgroundColor.rgb, starColor.rgb, twinkle);
  gl_FragColor = vec4(color, 1.0);
}
