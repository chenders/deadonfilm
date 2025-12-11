#!/bin/bash
set -e

# Configuration - update these values
PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
REPO_NAME="deadonfilm-repo"
IMAGE_NAME="dead-on-film"
CLUSTER_NAME="${GKE_CLUSTER_NAME:-deadonfilm-cluster}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check required configuration
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP_PROJECT_ID environment variable is required${NC}"
    echo "Usage: GCP_PROJECT_ID=your-project-id ./scripts/deploy.sh"
    exit 1
fi

echo -e "${GREEN}Deploying Dead on Film to GKE${NC}"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Cluster: $CLUSTER_NAME"
echo ""

# Get the full image path
IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}"
TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")

echo -e "${YELLOW}Step 1: Configure Docker for Artifact Registry${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

echo -e "${YELLOW}Step 2: Build Docker image${NC}"
docker build -t ${IMAGE_PATH}:${TAG} -t ${IMAGE_PATH}:latest .

echo -e "${YELLOW}Step 3: Push Docker image${NC}"
docker push ${IMAGE_PATH}:${TAG}
docker push ${IMAGE_PATH}:latest

echo -e "${YELLOW}Step 4: Get GKE credentials${NC}"
gcloud container clusters get-credentials ${CLUSTER_NAME} --region ${REGION} --project ${PROJECT_ID}

echo -e "${YELLOW}Step 5: Apply Kubernetes manifests${NC}"
# Create namespace if it doesn't exist
kubectl apply -f k8s/namespace.yaml

# Check if secrets exist, if not prompt
if ! kubectl get secret dead-on-film-secrets -n deadonfilm &>/dev/null; then
    echo -e "${YELLOW}Secrets not found. Please create them:${NC}"
    echo ""
    echo "kubectl create secret generic dead-on-film-secrets \\"
    echo "  --namespace=deadonfilm \\"
    echo "  --from-literal=TMDB_API_TOKEN=your_tmdb_token \\"
    echo "  --from-literal=ANTHROPIC_API_KEY=your_anthropic_key"
    echo ""
    read -p "Press Enter after creating secrets to continue..."
fi

# Update the deployment with the actual image
sed "s|us-central1-docker.pkg.dev/PROJECT_ID/deadonfilm-repo/dead-on-film:latest|${IMAGE_PATH}:${TAG}|g" k8s/deployment.yaml | kubectl apply -f -

kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

echo -e "${YELLOW}Step 6: Wait for deployment to be ready${NC}"
kubectl rollout status deployment/dead-on-film -n deadonfilm --timeout=120s

echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "To check status:"
echo "  kubectl get pods -n deadonfilm"
echo "  kubectl get ingress -n deadonfilm"
echo ""
echo "To get the external IP:"
echo "  kubectl get ingress dead-on-film-ingress -n deadonfilm -o jsonpath='{.status.loadBalancer.ingress[0].ip}'"
