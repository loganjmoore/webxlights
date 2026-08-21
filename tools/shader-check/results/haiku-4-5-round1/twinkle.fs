/*{
  "DESCRIPTION": "Twinkling stars scattered across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "starColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "backgroundColor", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.2, 1.0] },
    { "NAME": "twinkleDensity", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 8.0 },
    { "NAME": "twinkling", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/

float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 grid = uv * twinkleDensity;
  vec2 gridCell = floor(grid);
  
  float closestDist = 1.0;
  float twinkleVal = 0.0;
  
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      vec2 neighbor = gridCell + vec2(float(dx), float(dy));
      float seedx = hash(neighbor);
      float seedy = hash(neighbor + vec2(73.2, 24.8));
      
      vec2 starPos = neighbor + vec2(seedx, seedy);
      float dist = length(grid - starPos);
      
      if (dist < closestDist) {
        closestDist = dist;
        float twinklePhase = hash(neighbor + vec2(41.1, 83.4)) * 6.283185307;
        twinkleVal = 0.5 + 0.5 * sin(TIME * twinkling + twinklePhase);
        twinkleVal = smoothstep(0.6, 0.0, dist) * twinkleVal;
      }
    }
  }
  
  vec3 finalColor = mix(backgroundColor.rgb, starColor.rgb, twinkleVal);
  gl_FragColor = vec4(finalColor, 1.0);
}
