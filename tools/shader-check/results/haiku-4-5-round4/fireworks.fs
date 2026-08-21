/*{
  "DESCRIPTION": "Fireworks bursting outward from random points with trails fading over time",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

float hash(float n) {
  return fract(sin(n * 43758.5453) * 12345.0);
}

vec3 fireworkColor(float seed) {
  float choice = mod(seed, 3.0);
  if (choice < 1.0) return colorA.rgb;
  if (choice < 2.0) return colorB.rgb;
  return colorC.rgb;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Determine if this is a thin horizontal line (roof edge)
  bool isThin = RENDERSIZE.y < 2.0;
  
  vec3 result = vec3(0.0);
  
  // Multiple firework bursts
  for (int i = 0; i < 8; i++) {
    float id = float(i);
    
    // Burst center position cycles through time
    float burstPhase = mod(TIME * speed * 0.5 + id * 0.3, 4.0);
    float burstTime = fract(burstPhase);
    float burstCycle = floor(burstPhase);
    
    // Random burst location
    float seedX = hash(id + burstCycle * 7.0);
    float seedY = hash(id + burstCycle * 13.0);
    
    vec2 center;
    if (isThin) {
      center = vec2(seedX, 0.5);
    } else {
      center = vec2(seedX, seedY);
    }
    
    // Vector from center to current pixel
    vec2 diff;
    if (isThin) {
      diff = vec2(uv.x - center.x, 0.0);
    } else {
      diff = uv - center;
    }
    
    float dist = length(diff) * scale;
    
    // Expansion radius: grows quickly then fades
    float expansionRadius = burstTime * 0.6;
    float trailWidth = 0.08 / (1.0 + abs(dist - expansionRadius) * 15.0);
    
    // Fade out over burst duration
    float fade = (1.0 - burstTime) * (1.0 - burstTime);
    
    vec3 burstColor = fireworkColor(hash(id * 11.0));
    result += burstColor * trailWidth * fade;
  }
  
  // Clamp and output
  result = min(result, vec3(1.0));
  gl_FragColor = vec4(result, 1.0);
}
