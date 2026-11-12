import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/shared/ui.jsx';

export default function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        description="The link may be out of date. Head back to the overview to continue."
        action={
          <Link to="/" className="btn btn-primary">
            Back to overview
          </Link>
        }
      />
    </div>
  );
}
